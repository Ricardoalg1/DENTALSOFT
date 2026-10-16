package lat.occlus.cash;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
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
import lat.occlus.cash.CashDtos.ItemRequest;
import lat.occlus.cash.CashDtos.ItemResponse;
import lat.occlus.cash.CashDtos.PaymentRequest;
import lat.occlus.cash.CashDtos.PaymentResponse;
import lat.occlus.clinic.ClinicRepository;
import lat.occlus.clinical.Icd10Service;
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
import lat.occlus.treatment.Procedure;
import lat.occlus.treatment.ProcedureRepository;
import lat.occlus.treatment.PlanStatus;
import lat.occlus.treatment.TreatmentItemRepository;
import lat.occlus.treatment.TreatmentPlan;
import lat.occlus.treatment.TreatmentPlanRepository;
import lat.occlus.user.AppUserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
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
    private final PaymentItemRepository paymentItems;
    private final FinancingRepository financings;
    private final ProcedureRepository procedures;
    private final AppUserRepository users;
    private final Icd10Service icd10;
    private final JdbcTemplate jdbc;

    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");

    @Transactional(readOnly = true)
    public List<PaymentResponse> byPatient(UUID clinicId, UUID patientId) {
        access.requirePatient(clinicId, patientId);
        return toResponses(payments.findByClinicIdAndPatientIdOrderByReceivedAtDesc(clinicId, patientId));
    }

    @Transactional(readOnly = true)
    public PaymentResponse get(UUID clinicId, UUID id) {
        return toResponses(List.of(find(clinicId, id))).getFirst();
    }

    /**
     * Registra un ingreso en la caja abierta de la sede y le asigna el siguiente número de recibo.
     * Abono (ACCOUNT): valor digitado, opcionalmente aplicado a un plan aceptado; se descuenta del estado de cuenta.
     * Recibo de venta (SALE): el valor es la suma del detalle de procedimientos; no afecta el estado de cuenta.
     */
    @Transactional
    public PaymentResponse register(AuthUser me, UUID patientId, PaymentRequest req) {
        access.requirePatient(me.clinicId(), patientId);
        var session = sessions.findOpenLocked(me.clinicId(), req.siteId())
                .orElseThrow(() -> new ConflictException("No hay una caja abierta en esa sede: ábrela en Recaudos"));
        PaymentKind kind = req.kind() == null ? PaymentKind.ACCOUNT : req.kind();
        PaymentTerm term = req.paymentTerm() == null ? PaymentTerm.CASH : req.paymentTerm();
        if (term == PaymentTerm.CREDIT) {
            throw new BadRequestException("Para vender a crédito registra la financiación en Financiamiento");
        }
        List<ItemRequest> itemRequests = req.items() == null ? List.of() : req.items();
        if (kind == PaymentKind.SALE && itemRequests.isEmpty()) {
            throw new BadRequestException("Agrega al menos un procedimiento al detalle del ingreso");
        }
        if (kind == PaymentKind.ACCOUNT && !itemRequests.isEmpty()) {
            throw new BadRequestException("Un abono a cuenta no lleva detalle de procedimientos: usa un recibo");
        }
        if (req.planId() != null) {
            if (kind != PaymentKind.ACCOUNT) throw new BadRequestException("Solo un abono se aplica a un plan de tratamiento");
            plans.findByIdAndClinicId(req.planId(), me.clinicId())
                    .filter(p -> p.getPatientId().equals(patientId))
                    .filter(p -> p.getStatus() == PlanStatus.ACCEPTED || p.getStatus() == PlanStatus.COMPLETED)
                    .orElseThrow(() -> new BadRequestException("El abono solo se aplica a un plan aceptado del paciente"));
        }
        if (req.financingId() != null) {
            if (kind != PaymentKind.ACCOUNT || req.planId() != null) {
                throw new BadRequestException("El pago de cuotas es un abono a cuenta, sin plan");
            }
            financings.findByIdAndClinicId(req.financingId(), me.clinicId())
                    .filter(f -> f.getPatientId().equals(patientId) && !f.isCancelled())
                    .orElseThrow(() -> new BadRequestException("Financiamiento no válido para este paciente"));
        }
        if (req.dentistId() != null) {
            users.findByIdAndClinicId(req.dentistId(), me.clinicId())
                    .filter(u -> u.isActive() && u.isProfessional())
                    .orElseThrow(() -> new BadRequestException("El doctor no es un profesional activo de la clínica"));
        }
        String payerName = clean(req.payerName());
        String payerDocument = clean(req.payerDocument());
        if ((payerName == null) != (payerDocument == null)) {
            throw new BadRequestException("Para expedirlo a nombre de un tercero indica su nombre o razón social y su documento");
        }
        LocalDate today = LocalDate.now(BOGOTA);
        LocalDate incomeDate = req.incomeDate() == null ? today : req.incomeDate();
        LocalDate openedOn = session.getOpenedAt().atZone(BOGOTA).toLocalDate();
        if (incomeDate.isAfter(today)) throw new BadRequestException("La fecha del ingreso no puede ser futura");
        if (incomeDate.isBefore(openedOn)) {
            throw new BadRequestException("La fecha del ingreso no puede ser anterior a la apertura de la caja (" + openedOn + ")");
        }

        var lines = new ArrayList<PaymentItem>();
        for (int i = 0; i < itemRequests.size(); i++) lines.add(line(me.clinicId(), i + 1, itemRequests.get(i)));
        BigDecimal amount;
        if (kind == PaymentKind.SALE) {
            amount = lines.stream().map(PaymentItem::getTotal).reduce(BigDecimal.ZERO, BigDecimal::add);
            if (amount.signum() <= 0) throw new BadRequestException("El total del ingreso debe ser mayor que cero");
        } else {
            if (req.amount() == null) throw new BadRequestException("Indica el valor del abono");
            amount = req.amount();
        }

        var p = new Payment();
        p.setClinicId(me.clinicId());
        p.setPatientId(patientId);
        p.setPlanId(req.planId());
        p.setFinancingId(req.financingId());
        p.setCashSessionId(session.getId());
        p.setReceiptNumber(counter.next(me.clinicId(), ReceiptCounter.RECEIPT));
        p.setAmount(amount);
        p.setMethod(req.method());
        p.setReference(clean(req.reference()));
        p.setNotes(clean(req.notes()));
        p.setReceivedBy(me.userId());
        p.setKind(kind);
        p.setIncomeDate(incomeDate);
        p.setDentistId(req.dentistId());
        p.setPayerName(payerName);
        p.setPayerDocument(payerDocument);
        p.setConcept(clean(req.concept()));
        p.setPaymentTerm(term);
        var saved = payments.saveAndFlush(p);
        lines.forEach(l -> l.setPaymentId(saved.getId()));
        paymentItems.saveAllAndFlush(lines);
        return toResponses(List.of(saved)).getFirst();
    }

    /** Valida una línea y calcula subtotal, descuento y total (redondeo a centavos). */
    private PaymentItem line(UUID clinicId, int position, ItemRequest r) {
        if (r.procedureId() != null && procedures.findByIdAndClinicId(r.procedureId(), clinicId).isEmpty()) {
            throw new BadRequestException("Procedimiento no válido en la línea " + position);
        }
        BigDecimal subtotal = r.unitPrice().multiply(BigDecimal.valueOf(r.quantity()));
        BigDecimal value = r.discountValue() == null ? BigDecimal.ZERO : r.discountValue();
        if (r.discountType() == null && value.signum() > 0) {
            throw new BadRequestException("Indica el tipo de descuento en la línea " + position);
        }
        BigDecimal discount = r.discountType() == null ? BigDecimal.ZERO : switch (r.discountType()) {
            case PERCENT -> {
                if (value.compareTo(BigDecimal.valueOf(100)) > 0) throw new BadRequestException("El descuento no puede superar el 100 % (línea " + position + ")");
                yield subtotal.multiply(value).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            }
            case AMOUNT -> value;
        };
        if (discount.compareTo(subtotal) > 0) throw new BadRequestException("El descuento supera el valor de la línea " + position);
        var item = new PaymentItem();
        item.setId(UUID.randomUUID());
        item.setClinicId(clinicId);
        item.setPosition((short) position);
        item.setProcedureId(r.procedureId());
        item.setDescription(r.description().trim());
        item.setCupsCode(clean(r.cupsCode()));
        item.setQuantity(r.quantity());
        item.setPurpose(clean(r.purpose()));
        item.setUnitPrice(r.unitPrice());
        item.setDiscountType(r.discountType());
        item.setDiscountValue(r.discountType() == null ? BigDecimal.ZERO : value);
        item.setTotal(subtotal.subtract(discount).setScale(2, RoundingMode.HALF_UP));
        item.setDiagnosisMain(icd10.validCode(r.diagnosisMain()));
        item.setDiagnosisRelated(icd10.validCode(r.diagnosisRelated()));
        return item;
    }

    /** Ingresos de la clínica en un rango de fechas (opcionalmente por sede y tipo), del más reciente al más antiguo. */
    @Transactional(readOnly = true)
    public lat.occlus.shared.web.PageResponse<PaymentResponse> search(UUID clinicId, LocalDate from, LocalDate to,
                                                                      UUID siteId, PaymentKind kind, String query,
                                                                      int page, int size) {
        if (page < 0 || page > 100000 || size < 1 || size > 100 || (query != null && query.length() > 120)) {
            throw new BadRequestException("Filtros de búsqueda inválidos");
        }
        if (from.isAfter(to)) throw new BadRequestException("La fecha inicial es posterior a la final");
        var where = new StringBuilder(" from payment p join cash_session s on s.id = p.cash_session_id"
                + " join patient pt on pt.id = p.patient_id where p.clinic_id = ? and p.income_date between ? and ?");
        var args = new ArrayList<Object>(List.of(clinicId, from, to));
        if (siteId != null) { where.append(" and s.site_id = ?"); args.add(siteId); }
        if (kind != null) { where.append(" and p.kind = ?"); args.add(kind.name()); }
        if (query != null && !query.isBlank()) {
            where.append(" and concat_ws(' ', pt.first_name, pt.middle_name, pt.first_last_name, pt.second_last_name,"
                    + " pt.document_number, p.receipt_number::text, p.payer_name, p.concept) ilike ? escape '!'");
            args.add("%" + query.trim().replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%");
        }
        long count = jdbc.queryForObject("select count(*)" + where, Long.class, args.toArray());
        int pages = (int) Math.ceil((double) count / size);
        int actual = pages == 0 ? 0 : Math.min(page, pages - 1);
        args.add(size);
        args.add(actual * size);
        var ids = jdbc.queryForList("select p.id" + where + " order by p.income_date desc, p.receipt_number desc limit ? offset ?",
                UUID.class, args.toArray());
        var byId = payments.findAllById(ids).stream().collect(Collectors.toMap(Payment::getId, Function.identity()));
        var ordered = ids.stream().map(byId::get).filter(Objects::nonNull).toList();
        return new lat.occlus.shared.web.PageResponse<>(toResponses(ordered), actual, size, count, pages);
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
        var users = access.userRefs(list.stream()
                .flatMap(p -> Stream.of(p.getReceivedBy(), p.getVoidedBy(), p.getDentistId())).toList());
        Map<UUID, List<PaymentItem>> itemsByPayment = paymentItems.findByPaymentIdInOrderByPosition(
                        list.stream().map(Payment::getId).toList()).stream()
                .collect(Collectors.groupingBy(PaymentItem::getPaymentId));
        Map<UUID, String> procedureNames = procedures.findAllById(itemsByPayment.values().stream().flatMap(List::stream)
                        .map(PaymentItem::getProcedureId).filter(Objects::nonNull).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(Procedure::getId, Procedure::getName));

        return list.stream().map(p -> {
            var patient = patientById.get(p.getPatientId());
            UUID siteId = siteBySession.get(p.getCashSessionId());
            return new PaymentResponse(p.getId(), p.getReceiptNumber(),
                    new Ref(patient.getId(), patient.fullName()), patient.getDocumentType() + " " + patient.getDocumentNumber(),
                    p.getPlanId() == null ? null : new Ref(p.getPlanId(), planTitles.get(p.getPlanId())),
                    new Ref(siteId, siteNames.get(siteId)), p.getCashSessionId(),
                    p.getAmount(), p.getMethod(), p.getReference(), p.getNotes(),
                    users.get(p.getReceivedBy()), p.getReceivedAt(), p.getVoidedAt(), users.get(p.getVoidedBy()),
                    p.getVoidReason(), clinic.getName(), clinic.getNit(),
                    p.getKind(), p.getIncomeDate(), users.get(p.getDentistId()), p.getPayerName(), p.getPayerDocument(),
                    p.getConcept(), p.getPaymentTerm(),
                    itemsByPayment.getOrDefault(p.getId(), List.of()).stream().map(i -> item(i, procedureNames)).toList(),
                    p.getFinancingId());
        }).toList();
    }

    private static ItemResponse item(PaymentItem i, Map<UUID, String> procedureNames) {
        BigDecimal subtotal = i.getUnitPrice().multiply(BigDecimal.valueOf(i.getQuantity()));
        return new ItemResponse(i.getPosition(),
                i.getProcedureId() == null ? null : new Ref(i.getProcedureId(), procedureNames.get(i.getProcedureId())),
                i.getDescription(), i.getCupsCode(), i.getQuantity(), i.getPurpose(), i.getUnitPrice(), subtotal,
                i.getDiscountType(), i.getDiscountValue(), subtotal.subtract(i.getTotal()), i.getTotal(),
                i.getDiagnosisMain(), i.getDiagnosisRelated());
    }

    private static String clean(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
