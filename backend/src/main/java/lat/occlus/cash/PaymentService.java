package lat.occlus.cash;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import lat.occlus.cash.CashDtos.AccountResponse;
import lat.occlus.cash.CashDtos.PaymentRequest;
import lat.occlus.cash.CashDtos.PaymentResponse;
import lat.occlus.clinic.ClinicRepository;
import lat.occlus.patient.Patient;
import lat.occlus.patient.PatientRepository;
import lat.occlus.shared.access.StaffAccess;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.ConflictException;
import lat.occlus.shared.web.NotFoundException;
import lat.occlus.shared.web.Ref;
import lat.occlus.site.Site;
import lat.occlus.site.SiteRepository;
import lat.occlus.treatment.ItemStatus;
import lat.occlus.treatment.PlanStatus;
import lat.occlus.treatment.TreatmentItemRepository;
import lat.occlus.treatment.TreatmentPlan;
import lat.occlus.treatment.TreatmentPlanRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class PaymentService {

    /** Planes cuyos procedimientos cuentan para el estado de cuenta. */
    private static final EnumSet<PlanStatus> BILLABLE_PLANS =
            EnumSet.of(PlanStatus.ACCEPTED, PlanStatus.COMPLETED, PlanStatus.CANCELLED);

    private final PaymentRepository payments;
    private final CashSessionRepository sessions;
    private final TreatmentPlanRepository plans;
    private final TreatmentItemRepository items;
    private final PatientRepository patients;
    private final SiteRepository sites;
    private final ClinicRepository clinics;
    private final ReceiptCounter counter;
    private final StaffAccess access;

    @Transactional(readOnly = true)
    public List<PaymentResponse> byPatient(UUID clinicId, UUID patientId) {
        access.requirePatient(clinicId, patientId);
        return toResponses(payments.findByClinicIdAndPatientIdOrderByReceivedAtDesc(clinicId, patientId));
    }

    @Transactional(readOnly = true)
    public PaymentResponse get(UUID clinicId, UUID id) {
        return toResponses(List.of(find(clinicId, id))).getFirst();
    }

    /** Registra un pago en la caja abierta de la sede y le asigna el siguiente número de recibo. */
    @Transactional
    public PaymentResponse register(AuthUser me, UUID patientId, PaymentRequest req) {
        access.requirePatient(me.clinicId(), patientId);
        var session = sessions.findOpenLocked(me.clinicId(), req.siteId())
                .orElseThrow(() -> new ConflictException("No hay una caja abierta en esa sede: ábrela en Caja"));
        if (req.planId() != null) {
            plans.findByIdAndClinicId(req.planId(), me.clinicId())
                    .filter(p -> p.getPatientId().equals(patientId))
                    .filter(p -> p.getStatus() == PlanStatus.ACCEPTED || p.getStatus() == PlanStatus.COMPLETED)
                    .orElseThrow(() -> new BadRequestException("El abono solo se aplica a un plan aceptado del paciente"));
        }
        var p = new Payment();
        p.setClinicId(me.clinicId());
        p.setPatientId(patientId);
        p.setPlanId(req.planId());
        p.setCashSessionId(session.getId());
        p.setReceiptNumber(counter.next(me.clinicId(), ReceiptCounter.RECEIPT));
        p.setAmount(req.amount());
        p.setMethod(req.method());
        p.setReference(clean(req.reference()));
        p.setNotes(clean(req.notes()));
        p.setReceivedBy(me.userId());
        return toResponses(List.of(payments.saveAndFlush(p))).getFirst();
    }

    /**
     * Anula un pago (solo administradores). Mientras la caja del pago siga abierta; si ya se cerró,
     * el cuadre de ese día ya quedó registrado y no se altera.
     */
    @Transactional
    public PaymentResponse voidPayment(AuthUser me, UUID id, String reason) {
        var p = find(me.clinicId(), id);
        if (p.isVoided()) throw new ConflictException("El pago ya fue anulado");
        var session = sessions.findLocked(me.clinicId(), p.getCashSessionId()).orElseThrow();
        if (!session.isOpen()) throw new ConflictException("La caja de ese pago ya se cerró: no se puede anular");
        p.setVoidedAt(Instant.now());
        p.setVoidedBy(me.userId());
        p.setVoidReason(reason.trim());
        return toResponses(List.of(payments.saveAndFlush(p))).getFirst();
    }

    /** Estado de cuenta: presupuestado (aceptado), realizado, pagado y saldo. */
    @Transactional(readOnly = true)
    public AccountResponse account(UUID clinicId, UUID patientId) {
        access.requirePatient(clinicId, patientId);
        BigDecimal budgeted = items.sumForPatient(clinicId, patientId, BILLABLE_PLANS,
                EnumSet.of(ItemStatus.PENDING, ItemStatus.DONE));
        BigDecimal done = items.sumForPatient(clinicId, patientId, BILLABLE_PLANS, EnumSet.of(ItemStatus.DONE));
        BigDecimal paid = payments.sumPaid(clinicId, patientId);
        return new AccountResponse(budgeted, done, budgeted.subtract(done), paid, done.subtract(paid));
    }

    private Payment find(UUID clinicId, UUID id) {
        return payments.findByIdAndClinicId(id, clinicId).orElseThrow(() -> new NotFoundException("Pago no encontrado"));
    }

    /** Arma las respuestas con pacientes, planes, sedes y usuarios cargados en lote. */
    List<PaymentResponse> toResponses(List<Payment> list) {
        if (list.isEmpty()) return List.of();
        UUID clinicId = list.getFirst().getClinicId();
        var clinic = clinics.findById(clinicId).orElseThrow();
        Map<UUID, Patient> patientById = patients.findAllById(list.stream().map(Payment::getPatientId).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(Patient::getId, Function.identity()));
        Map<UUID, String> planTitles = plans.findAllById(list.stream().map(Payment::getPlanId).filter(Objects::nonNull)
                        .collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(TreatmentPlan::getId, TreatmentPlan::getTitle));
        Map<UUID, UUID> siteBySession = sessions.findAllById(list.stream().map(Payment::getCashSessionId)
                        .collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(CashSession::getId, CashSession::getSiteId));
        Map<UUID, String> siteNames = sites.findAllById(siteBySession.values()).stream()
                .collect(Collectors.toMap(Site::getId, Site::getName));
        var users = access.userRefs(list.stream().flatMap(p -> Stream.of(p.getReceivedBy(), p.getVoidedBy())).toList());

        return list.stream().map(p -> {
            var patient = patientById.get(p.getPatientId());
            UUID siteId = siteBySession.get(p.getCashSessionId());
            return new PaymentResponse(p.getId(), p.getReceiptNumber(),
                    new Ref(patient.getId(), patient.fullName()), patient.getDocumentType() + " " + patient.getDocumentNumber(),
                    p.getPlanId() == null ? null : new Ref(p.getPlanId(), planTitles.get(p.getPlanId())),
                    new Ref(siteId, siteNames.get(siteId)), p.getCashSessionId(),
                    p.getAmount(), p.getMethod(), p.getReference(), p.getNotes(),
                    users.get(p.getReceivedBy()), p.getReceivedAt(), p.getVoidedAt(), users.get(p.getVoidedBy()),
                    p.getVoidReason(), clinic.getName(), clinic.getNit());
        }).toList();
    }

    private static String clean(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
