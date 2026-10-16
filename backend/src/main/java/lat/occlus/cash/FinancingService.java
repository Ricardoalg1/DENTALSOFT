package lat.occlus.cash;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import lat.occlus.cash.CashDtos.FinancingRequest;
import lat.occlus.cash.CashDtos.FinancingResponse;
import lat.occlus.cash.CashDtos.FinancingStatus;
import lat.occlus.cash.CashDtos.InstallmentResponse;
import lat.occlus.cash.CashDtos.InstallmentStatus;
import lat.occlus.patient.Patient;
import lat.occlus.patient.PatientRepository;
import lat.occlus.shared.access.StaffAccess;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.ConflictException;
import lat.occlus.shared.web.NotFoundException;
import lat.occlus.shared.web.Ref;
import lat.occlus.treatment.PlanStatus;
import lat.occlus.treatment.TreatmentPlan;
import lat.occlus.treatment.TreatmentPlanRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Financiamiento: acuerdos de pago a cuotas, sin intereses. Las cuotas se generan al crear el acuerdo; lo pagado
 * (abonos con financingId) cubre primero la cuota inicial y luego las cuotas en orden de vencimiento.
 */
@Service
@RequiredArgsConstructor
public class FinancingService {

    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");

    private final FinancingRepository financings;
    private final FinancingInstallmentRepository installments;
    private final PatientRepository patients;
    private final TreatmentPlanRepository plans;
    private final StaffAccess access;

    @Transactional
    public FinancingResponse create(AuthUser me, UUID patientId, FinancingRequest req) {
        var patient = access.requirePatient(me.clinicId(), patientId);
        if (!patient.isActive()) throw new BadRequestException("El paciente está inactivo");
        if (req.planId() != null) {
            plans.findByIdAndClinicId(req.planId(), me.clinicId())
                    .filter(p -> p.getPatientId().equals(patientId))
                    .filter(p -> p.getStatus() == PlanStatus.ACCEPTED || p.getStatus() == PlanStatus.COMPLETED)
                    .orElseThrow(() -> new BadRequestException("El financiamiento solo se liga a un plan aceptado del paciente"));
        }
        BigDecimal down = req.downPayment() == null ? BigDecimal.ZERO : req.downPayment();
        if (down.compareTo(req.totalAmount()) >= 0) throw new BadRequestException("La cuota inicial debe ser menor que el total");
        LocalDate today = LocalDate.now(BOGOTA);
        if (req.firstDue().isBefore(today)) throw new BadRequestException("La primera cuota no puede vencer antes de hoy");

        var f = new Financing();
        f.setId(UUID.randomUUID());
        f.setClinicId(me.clinicId());
        f.setPatientId(patientId);
        f.setPlanId(req.planId());
        f.setConcept(req.concept().trim());
        f.setTotalAmount(req.totalAmount());
        f.setDownPayment(down);
        f.setInstallments(req.installments().shortValue());
        f.setFrequency(req.frequency());
        f.setFirstDue(req.firstDue());
        f.setNotes(req.notes() == null || req.notes().isBlank() ? null : req.notes().trim());
        f.setCreatedBy(me.userId());
        // Con id asignado, save hace merge: la instancia guardada (con createdAt) es la que devuelve.
        var saved = financings.saveAndFlush(f);

        // Cuotas iguales; la última absorbe los centavos del redondeo.
        int n = req.installments();
        BigDecimal financed = req.totalAmount().subtract(down);
        BigDecimal each = financed.divide(BigDecimal.valueOf(n), 2, RoundingMode.DOWN);
        var list = new ArrayList<FinancingInstallment>();
        for (int i = 0; i < n; i++) {
            var inst = new FinancingInstallment();
            inst.setId(UUID.randomUUID());
            inst.setClinicId(me.clinicId());
            inst.setFinancingId(saved.getId());
            inst.setNumber((short) (i + 1));
            inst.setDueDate(req.frequency().due(req.firstDue(), i));
            inst.setAmount(i == n - 1 ? financed.subtract(each.multiply(BigDecimal.valueOf(n - 1))) : each);
            list.add(inst);
        }
        if (list.stream().anyMatch(i -> i.getAmount().signum() <= 0)) {
            throw new BadRequestException("Demasiadas cuotas para ese valor");
        }
        installments.saveAllAndFlush(list);
        return toResponses(List.of(saved)).getFirst();
    }

    /** Cancela el acuerdo (solo administradores). Los abonos ya hechos siguen contando en el estado de cuenta. */
    @Transactional
    public FinancingResponse cancel(AuthUser me, UUID id, String reason) {
        var f = find(me.clinicId(), id);
        if (f.isCancelled()) throw new ConflictException("El financiamiento ya fue cancelado");
        f.setCancelledAt(Instant.now());
        f.setCancelledBy(me.userId());
        f.setCancelReason(reason.trim());
        return toResponses(List.of(financings.saveAndFlush(f))).getFirst();
    }

    @Transactional(readOnly = true)
    public FinancingResponse get(UUID clinicId, UUID id) {
        return toResponses(List.of(find(clinicId, id))).getFirst();
    }

    @Transactional(readOnly = true)
    public List<FinancingResponse> byPatient(UUID clinicId, UUID patientId) {
        access.requirePatient(clinicId, patientId);
        return toResponses(financings.findByClinicIdAndPatientIdOrderByCreatedAtDesc(clinicId, patientId));
    }

    /** Acuerdos de la clínica (los 1000 más recientes), opcionalmente por estado y texto (paciente o concepto). */
    @Transactional(readOnly = true)
    public List<FinancingResponse> list(UUID clinicId, FinancingStatus status, String query) {
        if (query != null && query.length() > 120) throw new BadRequestException("Búsqueda demasiado larga");
        String q = query == null ? "" : normalize(query.trim());
        return toResponses(financings.findByClinicIdOrderByCreatedAtDesc(clinicId, Limit.of(1000))).stream()
                .filter(f -> status == null || f.status() == status)
                .filter(f -> q.isEmpty() || normalize(f.patient().name() + " " + f.patientDocument() + " " + f.concept()).contains(q))
                .toList();
    }

    private Financing find(UUID clinicId, UUID id) {
        return financings.findByIdAndClinicId(id, clinicId).orElseThrow(() -> new NotFoundException("Financiamiento no encontrado"));
    }

    List<FinancingResponse> toResponses(List<Financing> list) {
        if (list.isEmpty()) return List.of();
        Collection<UUID> ids = list.stream().map(Financing::getId).toList();
        Map<UUID, List<FinancingInstallment>> schedule = installments.findByFinancingIdInOrderByNumber(ids).stream()
                .collect(Collectors.groupingBy(FinancingInstallment::getFinancingId));
        Map<UUID, BigDecimal> paid = financings.paidByFinancing(ids).stream()
                .collect(Collectors.toMap(r -> (UUID) r[0], r -> (BigDecimal) r[1]));
        Map<UUID, Patient> patientById = patients.findAllById(list.stream().map(Financing::getPatientId).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(Patient::getId, Function.identity()));
        Map<UUID, String> planTitles = plans.findAllById(list.stream().map(Financing::getPlanId).filter(Objects::nonNull)
                        .collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(TreatmentPlan::getId, TreatmentPlan::getTitle));
        var users = access.userRefs(list.stream().flatMap(f -> Stream.of(f.getCreatedBy(), f.getCancelledBy())).toList());
        LocalDate today = LocalDate.now(BOGOTA);

        return list.stream().map(f -> {
            BigDecimal paidTotal = paid.getOrDefault(f.getId(), BigDecimal.ZERO);
            // Cuota inicial (0) y luego las cuotas, cubiertas en orden con lo pagado.
            var rows = new ArrayList<InstallmentResponse>();
            BigDecimal remaining = paidTotal;
            BigDecimal overdue = BigDecimal.ZERO;
            LocalDate nextDue = null;
            var due = new ArrayList<Object[]>();
            if (f.getDownPayment().signum() > 0) {
                due.add(new Object[] {0, f.getCreatedAt().atZone(BOGOTA).toLocalDate(), f.getDownPayment()});
            }
            for (var i : schedule.getOrDefault(f.getId(), List.of())) due.add(new Object[] {(int) i.getNumber(), i.getDueDate(), i.getAmount()});
            for (var d : due) {
                LocalDate date = (LocalDate) d[1];
                BigDecimal amount = (BigDecimal) d[2];
                BigDecimal covered = remaining.min(amount).max(BigDecimal.ZERO);
                remaining = remaining.subtract(covered);
                InstallmentStatus st = covered.compareTo(amount) >= 0 ? InstallmentStatus.PAID
                        : date.isBefore(today) ? InstallmentStatus.OVERDUE
                        : covered.signum() > 0 ? InstallmentStatus.PARTIAL : InstallmentStatus.PENDING;
                if (st == InstallmentStatus.OVERDUE) overdue = overdue.add(amount.subtract(covered));
                if (st != InstallmentStatus.PAID && nextDue == null) nextDue = date;
                rows.add(new InstallmentResponse((int) d[0], date, amount, covered, st));
            }
            BigDecimal balance = f.getTotalAmount().subtract(paidTotal).max(BigDecimal.ZERO);
            FinancingStatus status = f.isCancelled() ? FinancingStatus.CANCELLED
                    : balance.signum() == 0 ? FinancingStatus.PAID
                    : overdue.signum() > 0 ? FinancingStatus.OVERDUE : FinancingStatus.ACTIVE;
            var patient = patientById.get(f.getPatientId());
            return new FinancingResponse(f.getId(), new Ref(patient.getId(), patient.fullName()),
                    patient.getDocumentType() + " " + patient.getDocumentNumber(),
                    f.getPlanId() == null ? null : new Ref(f.getPlanId(), planTitles.get(f.getPlanId())), f.getConcept(),
                    f.getTotalAmount(), f.getDownPayment(), f.getInstallments(), f.getFrequency(), f.getFirstDue(), f.getNotes(),
                    users.get(f.getCreatedBy()), f.getCreatedAt(), f.getCancelledAt(), users.get(f.getCancelledBy()),
                    f.getCancelReason(), paidTotal, balance, overdue, status, f.isCancelled() ? null : nextDue, rows);
        }).toList();
    }

    private static String normalize(String s) {
        return java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase();
    }
}
