package lat.occlus.treatment;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import lat.occlus.clinical.OdontogramCondition;
import lat.occlus.clinical.OdontogramEntry;
import lat.occlus.clinical.OdontogramEntryRepository;
import lat.occlus.shared.access.StaffAccess;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.ConflictException;
import lat.occlus.shared.web.NotFoundException;
import lat.occlus.shared.web.Ref;
import lat.occlus.treatment.TreatmentDtos.ItemRequest;
import lat.occlus.treatment.TreatmentDtos.ItemResponse;
import lat.occlus.treatment.TreatmentDtos.PlanRequest;
import lat.occlus.treatment.TreatmentDtos.PlanResponse;
import lat.occlus.treatment.TreatmentDtos.PlanSummary;
import lat.occlus.treatment.TreatmentDtos.PlanTotals;
import lat.occlus.treatment.TreatmentDtos.Suggestion;
import lat.occlus.user.Role;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class TreatmentPlanService {

    /** Hallazgos del odontograma que piden un tratamiento. */
    private static final Set<OdontogramCondition> FINDINGS = EnumSet.of(OdontogramCondition.CARIES,
            OdontogramCondition.FRACTURE, OdontogramCondition.ROOT_CANAL_INDICATED,
            OdontogramCondition.EXTRACTION_INDICATED, OdontogramCondition.REMNANT_ROOT);

    private final TreatmentPlanRepository plans;
    private final TreatmentItemRepository items;
    private final ProcedureRepository procedures;
    private final OdontogramEntryRepository odontogram;
    private final StaffAccess access;

    // ---------- Consultas ----------

    @Transactional(readOnly = true)
    public List<PlanSummary> list(UUID clinicId, UUID patientId) {
        access.requirePatient(clinicId, patientId);
        var list = plans.findByClinicIdAndPatientIdOrderByCreatedAtDesc(clinicId, patientId);
        Map<UUID, List<TreatmentItem>> itemsByPlan = items.findByPlanIdInOrderBySortOrderAscCreatedAtAsc(
                        list.stream().map(TreatmentPlan::getId).toList()).stream()
                .collect(Collectors.groupingBy(TreatmentItem::getPlanId));
        var users = access.userRefs(list.stream().map(TreatmentPlan::getDentistId).toList());
        return list.stream().map(p -> {
            var planItems = itemsByPlan.getOrDefault(p.getId(), List.of());
            return new PlanSummary(p.getId(), p.getTitle(), p.getStatus(), users.get(p.getDentistId()), p.getCreatedAt(),
                    (int) planItems.stream().filter(i -> i.getStatus() != ItemStatus.CANCELLED).count(), totals(planItems));
        }).toList();
    }

    @Transactional(readOnly = true)
    public PlanResponse get(UUID clinicId, UUID id) {
        return toResponse(find(clinicId, id));
    }

    /**
     * Sugerencias a partir de los hallazgos vigentes del odontograma (caries, fractura, endodoncia o
     * exodoncia indicada, resto radicular) para los que la lista de precios tiene un procedimiento.
     * Las caries de un mismo diente se agrupan en una sola resina con todas sus superficies.
     * No sugiere lo que ya está pendiente en un plan en borrador o aceptado.
     */
    @Transactional(readOnly = true)
    public List<Suggestion> suggestions(UUID clinicId, UUID patientId) {
        access.requirePatient(clinicId, patientId);
        Map<OdontogramCondition, Procedure> procedureFor = procedures.findByClinicIdOrderByCategoryAscNameAsc(clinicId)
                .stream()
                .filter(p -> p.isActive() && p.getTreatsCondition() != null)
                .collect(Collectors.toMap(Procedure::getTreatsCondition, Function.identity(), (a, b) -> a));
        var alreadyPlanned = items.findOpenForPatient(clinicId, patientId).stream()
                .map(i -> i.getServiceId() + ":" + i.getTooth())
                .collect(Collectors.toSet());

        // diente → condición → superficies
        Map<Integer, Map<OdontogramCondition, String>> findings = new TreeMap<>();
        for (OdontogramEntry e : odontogram.findActiveAt(clinicId, patientId, Instant.now())) {
            if (!FINDINGS.contains(e.getCondition())) continue;
            findings.computeIfAbsent((int) e.getTooth(), t -> new TreeMap<>())
                    .merge(e.getCondition(), e.getSurface() == null ? "" : e.getSurface().name(), String::concat);
        }

        var result = new ArrayList<Suggestion>();
        findings.forEach((tooth, byCondition) -> byCondition.forEach((condition, surfaces) -> {
            var procedure = procedureFor.get(condition);
            if (procedure == null || alreadyPlanned.contains(procedure.getId() + ":" + tooth)) return;
            result.add(new Suggestion(tooth, surfaces.isEmpty() ? null : sortSurfaces(surfaces), condition,
                    procedure.getId(), procedure.getName(), procedure.getPrice()));
        }));
        return result;
    }

    // ---------- Edición del presupuesto ----------

    @Transactional
    public PlanResponse create(AuthUser me, UUID patientId, PlanRequest req) {
        access.requireProfessional(me);
        var patient = access.requirePatient(me.clinicId(), patientId);
        if (!patient.isActive()) throw new BadRequestException("El paciente está inactivo");
        var plan = new TreatmentPlan();
        plan.setClinicId(me.clinicId());
        plan.setPatientId(patientId);
        plan.setDentistId(me.userId());
        applyHeader(plan, req);
        return toResponse(plans.saveAndFlush(plan));
    }

    @Transactional
    public PlanResponse update(AuthUser me, UUID id, PlanRequest req) {
        var plan = findDraft(me, id);
        applyHeader(plan, req);
        return toResponse(plans.saveAndFlush(plan));
    }

    @Transactional
    public PlanResponse addItems(AuthUser me, UUID id, List<ItemRequest> reqs) {
        var plan = findDraft(me, id);
        int order = items.findByPlanIdOrderBySortOrderAscCreatedAtAsc(id).stream()
                .mapToInt(TreatmentItem::getSortOrder).max().orElse(0);
        for (var req : reqs) {
            var procedure = procedures.findByIdAndClinicId(req.procedureId(), me.clinicId())
                    .filter(Procedure::isActive)
                    .orElseThrow(() -> new BadRequestException("Procedimiento no válido"));
            if (procedure.isPerTooth() && req.tooth() == null) {
                throw new BadRequestException("«%s» se presupuesta por diente: indica el diente".formatted(procedure.getName()));
            }
            if (!procedure.isPerTooth() && (req.tooth() != null || req.surfaces() != null)) {
                throw new BadRequestException("«%s» no se presupuesta por diente".formatted(procedure.getName()));
            }
            if (req.tooth() != null && !OdontogramEntry.isValidTooth(req.tooth())) {
                throw new BadRequestException("El diente %d no existe en la notación FDI".formatted(req.tooth()));
            }
            var item = new TreatmentItem();
            item.setClinicId(me.clinicId());
            item.setPlanId(plan.getId());
            item.setServiceId(procedure.getId());
            item.setDescription(procedure.getName());
            item.setCupsCode(procedure.getCupsCode());
            item.setTooth(req.tooth() == null ? null : req.tooth().shortValue());
            item.setSurfaces(req.surfaces() == null ? null : sortSurfaces(req.surfaces()));
            item.setQuantity(req.quantity() == null ? 1 : req.quantity());
            item.setUnitPrice(procedure.getPrice());
            item.setDiscount(req.discount() == null ? BigDecimal.ZERO : req.discount());
            if (item.getDiscount().compareTo(item.getUnitPrice().multiply(BigDecimal.valueOf(item.getQuantity()))) > 0) {
                throw new BadRequestException("El descuento no puede superar el valor del procedimiento");
            }
            item.setSortOrder(++order);
            items.save(item);
        }
        items.flush();
        return toResponse(plan);
    }

    @Transactional
    public PlanResponse removeItem(AuthUser me, UUID planId, UUID itemId) {
        var plan = findDraft(me, planId);
        var item = items.findByIdAndPlanId(itemId, planId).orElseThrow(() -> new NotFoundException("Ítem no encontrado"));
        items.delete(item);
        items.flush();
        return toResponse(plan);
    }

    // ---------- Estados del plan ----------

    /** El paciente aprueba el presupuesto. Lo puede registrar cualquier usuario (p. ej. recepción). */
    @Transactional
    public PlanResponse accept(AuthUser me, UUID id) {
        var plan = find(me.clinicId(), id);
        requireStatus(plan, PlanStatus.DRAFT, "Solo se puede aceptar un presupuesto en borrador");
        if (items.findByPlanIdOrderBySortOrderAscCreatedAtAsc(id).isEmpty()) {
            throw new BadRequestException("Agrega al menos un procedimiento antes de aceptar el presupuesto");
        }
        plan.setStatus(PlanStatus.ACCEPTED);
        plan.setAcceptedAt(Instant.now());
        plan.setAcceptedBy(me.userId());
        return toResponse(plans.saveAndFlush(plan));
    }

    @Transactional
    public PlanResponse reject(AuthUser me, UUID id) {
        var plan = find(me.clinicId(), id);
        requireStatus(plan, PlanStatus.DRAFT, "Solo se puede rechazar un presupuesto en borrador");
        plan.setStatus(PlanStatus.REJECTED);
        plan.setClosedAt(Instant.now());
        return toResponse(plans.saveAndFlush(plan));
    }

    /** Suspende un plan aceptado: lo pendiente se cancela, lo realizado se conserva. */
    @Transactional
    public PlanResponse cancel(AuthUser me, UUID id) {
        if (me.role() != Role.ADMIN) access.requireProfessional(me);
        var plan = find(me.clinicId(), id);
        requireStatus(plan, PlanStatus.ACCEPTED, "Solo se puede cancelar un plan aceptado");
        items.findByPlanIdOrderBySortOrderAscCreatedAtAsc(id).stream()
                .filter(i -> i.getStatus() == ItemStatus.PENDING)
                .forEach(i -> i.setStatus(ItemStatus.CANCELLED));
        plan.setStatus(PlanStatus.CANCELLED);
        plan.setClosedAt(Instant.now());
        return toResponse(plans.saveAndFlush(plan));
    }

    /**
     * Marca un procedimiento como realizado, cancelado o de nuevo pendiente. Cuando ya no queda nada
     * pendiente el plan se cierra solo (completado); si se reabre un ítem, el plan vuelve a aceptado.
     */
    @Transactional
    public PlanResponse setItemStatus(AuthUser me, UUID planId, UUID itemId, ItemStatus next) {
        access.requireProfessional(me);
        var plan = find(me.clinicId(), planId);
        var item = items.findByIdAndPlanId(itemId, planId).orElseThrow(() -> new NotFoundException("Ítem no encontrado"));
        if (item.getStatus() == next) return toResponse(plan);

        boolean planOpen = plan.getStatus() == PlanStatus.ACCEPTED;
        switch (next) {
            case DONE, CANCELLED -> {
                if (!planOpen) throw new ConflictException("El plan debe estar aceptado");
                if (item.getStatus() != ItemStatus.PENDING) throw new ConflictException("Solo se cambian ítems pendientes");
            }
            case PENDING -> {
                if (!planOpen && plan.getStatus() != PlanStatus.COMPLETED) {
                    throw new ConflictException("El plan está cerrado");
                }
            }
        }
        item.setStatus(next);
        item.setDoneAt(next == ItemStatus.DONE ? Instant.now() : null);
        item.setDoneBy(next == ItemStatus.DONE ? me.userId() : null);
        items.flush();

        var all = items.findByPlanIdOrderBySortOrderAscCreatedAtAsc(planId);
        var active = all.stream().filter(i -> i.getStatus() != ItemStatus.CANCELLED).toList();
        if (active.isEmpty()) {
            plan.setStatus(PlanStatus.CANCELLED);
            plan.setClosedAt(Instant.now());
        } else if (active.stream().allMatch(i -> i.getStatus() == ItemStatus.DONE)) {
            plan.setStatus(PlanStatus.COMPLETED);
            plan.setClosedAt(Instant.now());
        } else if (plan.getStatus() == PlanStatus.COMPLETED) {
            plan.setStatus(PlanStatus.ACCEPTED);
            plan.setClosedAt(null);
        }
        return toResponse(plans.saveAndFlush(plan));
    }

    // ---------- Apoyo ----------

    private TreatmentPlan find(UUID clinicId, UUID id) {
        return plans.findByIdAndClinicId(id, clinicId).orElseThrow(() -> new NotFoundException("Plan no encontrado"));
    }

    /** Presupuesto en borrador, editable por un profesional. */
    private TreatmentPlan findDraft(AuthUser me, UUID id) {
        access.requireProfessional(me);
        var plan = find(me.clinicId(), id);
        requireStatus(plan, PlanStatus.DRAFT, "El presupuesto ya no está en borrador: no se puede modificar");
        return plan;
    }

    private static void requireStatus(TreatmentPlan plan, PlanStatus expected, String message) {
        if (plan.getStatus() != expected) throw new ConflictException(message);
    }

    private static void applyHeader(TreatmentPlan plan, PlanRequest req) {
        plan.setTitle(req.title().trim());
        plan.setNotes(req.notes() == null || req.notes().isBlank() ? null : req.notes().trim());
        plan.setValidUntil(req.validUntil());
    }

    static PlanTotals totals(Collection<TreatmentItem> list) {
        BigDecimal total = sum(list.stream().filter(i -> i.getStatus() != ItemStatus.CANCELLED));
        BigDecimal done = sum(list.stream().filter(i -> i.getStatus() == ItemStatus.DONE));
        return new PlanTotals(total, done, total.subtract(done));
    }

    private static BigDecimal sum(Stream<TreatmentItem> s) {
        return s.map(TreatmentItem::total).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** Superficies sin repetir y en orden fijo: "MOD", nunca "DOM". */
    private static String sortSurfaces(String s) {
        return "OMDVL".chars().filter(c -> s.indexOf(c) >= 0)
                .collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append).toString();
    }

    private PlanResponse toResponse(TreatmentPlan plan) {
        var planItems = items.findByPlanIdOrderBySortOrderAscCreatedAtAsc(plan.getId());
        var patient = access.requirePatient(plan.getClinicId(), plan.getPatientId());
        Map<UUID, Ref> users = access.userRefs(Stream.concat(
                        Stream.of(plan.getDentistId(), plan.getAcceptedBy()),
                        planItems.stream().map(TreatmentItem::getDoneBy))
                .filter(Objects::nonNull).toList());
        Map<UUID, String> procedureNames = procedures.findAllById(
                        planItems.stream().map(TreatmentItem::getServiceId).collect(Collectors.toSet())).stream()
                .collect(Collectors.toMap(Procedure::getId, Procedure::getName));
        var itemResponses = planItems.stream()
                .sorted(Comparator.comparingInt(TreatmentItem::getSortOrder))
                .map(i -> new ItemResponse(i.getId(), new Ref(i.getServiceId(), procedureNames.get(i.getServiceId())),
                        i.getDescription(), i.getCupsCode(), i.getTooth() == null ? null : (int) i.getTooth(), i.getSurfaces(),
                        i.getQuantity(), i.getUnitPrice(), i.getDiscount(), i.total(), i.getStatus(), i.getDoneAt(),
                        users.get(i.getDoneBy())))
                .toList();
        return new PlanResponse(plan.getId(), new Ref(patient.getId(), patient.fullName()), users.get(plan.getDentistId()),
                plan.getTitle(), plan.getStatus(), plan.getNotes(), plan.getValidUntil(), plan.getAcceptedAt(),
                users.get(plan.getAcceptedBy()), plan.getClosedAt(), plan.getCreatedAt(), itemResponses, totals(planItems));
    }
}
