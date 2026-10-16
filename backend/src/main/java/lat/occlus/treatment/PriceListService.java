package lat.occlus.treatment;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.ConflictException;
import lat.occlus.shared.web.NotFoundException;
import lat.occlus.shared.web.PageResponse;
import lat.occlus.shared.web.Ref;
import lat.occlus.treatment.TreatmentDtos.CupsImportRequest;
import lat.occlus.treatment.TreatmentDtos.CupsImportResponse;
import lat.occlus.treatment.TreatmentDtos.ImportResult;
import lat.occlus.treatment.TreatmentDtos.ImportRowError;
import lat.occlus.treatment.TreatmentDtos.ProcedureImportRow;
import lat.occlus.treatment.TreatmentDtos.ProcedureRequest;
import lat.occlus.treatment.TreatmentDtos.ProcedureResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Lista de precios: procedimientos (nombre, CUPS, tratamiento y precio) con búsqueda, estado e importación. */
@Service
@RequiredArgsConstructor
public class PriceListService {

    private static final java.util.Set<ProcedureCategory> PER_TOOTH = java.util.EnumSet.of(
            ProcedureCategory.RESTORATIVE, ProcedureCategory.ENDODONTICS, ProcedureCategory.SURGERY,
            ProcedureCategory.PROSTHODONTICS);

    private final ProcedureRepository procedures;
    private final TreatmentTypeRepository treatments;
    private final JdbcTemplate jdbc;

    @Transactional(readOnly = true)
    public List<ProcedureResponse> list(UUID clinicId, boolean includeInactive) {
        var names = treatmentNames(clinicId);
        return procedures.findByClinicIdOrderByCategoryAscNameAsc(clinicId).stream()
                .filter(p -> includeInactive || p.isActive())
                .map(p -> toResponse(p, names))
                .toList();
    }

    /** Búsqueda paginada (nombre, código interno, CUPS o tratamiento), por estado y tratamiento. {@code active} null = todos. */
    @Transactional(readOnly = true)
    public PageResponse<ProcedureResponse> search(UUID clinicId, String query, Boolean active, UUID treatmentId, int page, int size) {
        if (page < 0 || size < 1 || size > 100) throw new BadRequestException("Página inválida");
        String q = TreatmentTypeService.normalize(query);
        var filtered = list(clinicId, true).stream()
                .filter(p -> active == null || p.active() == active)
                .filter(p -> treatmentId == null || (p.treatment() != null && treatmentId.equals(p.treatment().id())))
                .filter(p -> q.isEmpty() || TreatmentTypeService.normalize(String.join(" ", p.name(),
                        Objects.toString(p.code(), ""), Objects.toString(p.cupsCode(), ""),
                        p.treatment() == null ? "" : Objects.toString(p.treatment().name(), ""))).contains(q))
                .sorted(Comparator.comparing(ProcedureResponse::name, String.CASE_INSENSITIVE_ORDER))
                .toList();
        int pages = (int) Math.ceil((double) filtered.size() / size);
        int actual = pages == 0 ? 0 : Math.min(page, pages - 1);
        var content = filtered.subList(Math.min(actual * size, filtered.size()), Math.min((actual + 1) * size, filtered.size()));
        return new PageResponse<>(content, actual, size, filtered.size(), pages);
    }

    /** Crear (id = null) o editar. Cambiar un precio no afecta los planes ya presupuestados. */
    @Transactional
    public ProcedureResponse save(UUID clinicId, UUID id, ProcedureRequest req) {
        String name = req.name().trim();
        boolean duplicate = id == null
                ? procedures.existsByClinicIdAndName(clinicId, name)
                : procedures.existsByClinicIdAndNameAndIdNot(clinicId, name, id);
        if (duplicate) throw new ConflictException("Ya existe un procedimiento con ese nombre");
        var p = id == null ? new Procedure()
                : procedures.findByIdAndClinicId(id, clinicId).orElseThrow(() -> new NotFoundException("Procedimiento no encontrado"));
        TreatmentType treatment = req.treatmentId() == null ? null : treatments.findByIdAndClinicId(req.treatmentId(), clinicId)
                .orElseThrow(() -> new BadRequestException("Tratamiento no válido"));
        ProcedureCategory category = req.category() != null ? req.category() : treatment != null ? treatment.getCategory() : null;
        if (category == null) throw new BadRequestException("Elige el tratamiento del procedimiento");
        p.setClinicId(clinicId);
        p.setCode(blankToNull(req.code()));
        p.setName(name);
        p.setCategory(category);
        p.setTreatmentId(treatment == null ? null : treatment.getId());
        p.setCupsCode(blankToNull(req.cupsCode()));
        p.setPrice(req.price());
        p.setPerTooth(req.perTooth());
        p.setTreatsCondition(req.treatsCondition());
        if (req.active() != null) p.setActive(req.active());
        return toResponse(procedures.saveAndFlush(p), treatmentNames(clinicId));
    }

    @Transactional
    public ProcedureResponse setActive(UUID clinicId, UUID id, boolean active) {
        var p = find(clinicId, id);
        p.setActive(active);
        return toResponse(procedures.saveAndFlush(p), treatmentNames(clinicId));
    }

    /** Solo se borra un procedimiento que no se haya usado en planes ni recibos; si se usó, se desactiva. */
    @Transactional
    public void delete(UUID clinicId, UUID id) {
        var p = find(clinicId, id);
        boolean used = Boolean.TRUE.equals(jdbc.queryForObject(
                "select exists(select 1 from treatment_item where service_id = ?) or exists(select 1 from payment_item where procedure_id = ?)",
                Boolean.class, id, id));
        if (used) throw new ConflictException("El procedimiento ya se usó en planes o recibos: desactívalo en lugar de eliminarlo");
        procedures.delete(p);
    }

    /**
     * Importa filas de un CSV: crea o actualiza por nombre. El tratamiento va por nombre y se crea (categoría
     * Otros) si no existe. Las filas con errores se omiten y se informan con su número de línea.
     */
    @Transactional
    public ImportResult importRows(UUID clinicId, List<ProcedureImportRow> rows) {
        int created = 0, updated = 0;
        var errors = new ArrayList<ImportRowError>();
        for (int i = 0; i < rows.size(); i++) {
            var r = rows.get(i);
            int line = i + 2;
            String problem = problem(r);
            if (problem != null) {
                errors.add(new ImportRowError(line, problem));
                continue;
            }
            UUID treatmentId = null;
            ProcedureCategory category = ProcedureCategory.OTHER;
            if (r.treatment() != null && !r.treatment().isBlank()) {
                String tName = r.treatment().trim();
                var t = treatments.findByClinicIdAndNameIgnoreCase(clinicId, tName).orElseGet(() -> {
                    var nt = new TreatmentType();
                    nt.setId(UUID.randomUUID());
                    nt.setClinicId(clinicId);
                    nt.setName(tName);
                    nt.setCategory(ProcedureCategory.OTHER);
                    return treatments.saveAndFlush(nt);
                });
                treatmentId = t.getId();
                category = t.getCategory();
            }
            String name = r.name().trim();
            var existing = procedures.findByClinicIdOrderByCategoryAscNameAsc(clinicId).stream()
                    .filter(p -> p.getName().equalsIgnoreCase(name)).findFirst();
            save(clinicId, existing.map(Procedure::getId).orElse(null), new ProcedureRequest(
                    r.code(), existing.map(Procedure::getName).orElse(name), category,
                    r.cupsCode() == null ? null : r.cupsCode().trim(), r.price(),
                    r.perTooth() == null ? existing.map(Procedure::isPerTooth).orElse(false) : r.perTooth(),
                    existing.map(Procedure::getTreatsCondition).orElse(null), r.active(), treatmentId));
            if (existing.isPresent()) updated++; else created++;
        }
        return new ImportResult(created, updated, 0, errors);
    }

    private static String problem(ProcedureImportRow r) {
        if (r == null || r.name() == null || r.name().isBlank() || r.name().trim().length() > 150) return "Falta el nombre (máx. 150 caracteres)";
        if (r.price() == null || r.price().signum() < 0 || r.price().scale() > 2) return "Precio inválido";
        if (r.cupsCode() != null && !r.cupsCode().trim().matches("[A-Za-z0-9]{0,10}")) return "Código CUPS inválido";
        if (r.code() != null && r.code().trim().length() > 20) return "Código interno de máximo 20 caracteres";
        if (r.treatment() != null && r.treatment().trim().length() > 150) return "Nombre de tratamiento demasiado largo";
        return null;
    }

    /** Carga los procedimientos de ejemplo que la clínica aún no tenga (por nombre). */
    @Transactional
    public List<ProcedureResponse> loadExamples(UUID clinicId) {
        for (var e : ExamplePriceList.EXAMPLES) {
            if (procedures.existsByClinicIdAndName(clinicId, e.name())) continue;
            var p = new Procedure();
            p.setClinicId(clinicId);
            p.setName(e.name());
            p.setCategory(e.category());
            p.setPrice(ExamplePriceList.price(e));
            p.setPerTooth(e.perTooth());
            p.setTreatsCondition(e.treats());
            procedures.save(p);
        }
        procedures.flush();
        return list(clinicId, true);
    }

    /**
     * Crea un procedimiento por cada código CUPS que la clínica aún no tenga (ni por código ni por nombre).
     * Se cobran por diente los de categorías que se hacen sobre un diente concreto. Con {@code treatmentId}, todos
     * quedan en ese tratamiento.
     */
    @Transactional
    public CupsImportResponse importCups(UUID clinicId, CupsImportRequest req) {
        TreatmentType treatment = req.treatmentId() == null ? null : treatments.findByIdAndClinicId(req.treatmentId(), clinicId)
                .orElseThrow(() -> new BadRequestException("Tratamiento no válido"));
        int created = 0;
        for (var item : req.items()) {
            String code = item.cupsCode().trim().toUpperCase(java.util.Locale.ROOT);
            String name = item.name().trim();
            if (procedures.existsByClinicIdAndCupsCode(clinicId, code) || procedures.existsByClinicIdAndName(clinicId, name)) continue;
            var p = new Procedure();
            p.setClinicId(clinicId);
            p.setName(name);
            p.setCategory(item.category());
            p.setCupsCode(code);
            p.setPrice(req.price());
            p.setPerTooth(PER_TOOTH.contains(item.category()));
            p.setTreatmentId(treatment == null ? null : treatment.getId());
            procedures.saveAndFlush(p);
            created++;
        }
        return new CupsImportResponse(created, req.items().size() - created);
    }

    private Procedure find(UUID clinicId, UUID id) {
        return procedures.findByIdAndClinicId(id, clinicId).orElseThrow(() -> new NotFoundException("Procedimiento no encontrado"));
    }

    private Map<UUID, String> treatmentNames(UUID clinicId) {
        var map = new HashMap<UUID, String>();
        treatments.findByClinicIdOrderByNameAsc(clinicId).forEach(t -> map.put(t.getId(), t.getName()));
        return map;
    }

    static ProcedureResponse toResponse(Procedure p, Map<UUID, String> treatmentNames) {
        return new ProcedureResponse(p.getId(), p.getCode(), p.getName(), p.getCategory(), p.getCupsCode(), p.getPrice(),
                p.isPerTooth(), p.getTreatsCondition(), p.isActive(),
                p.getTreatmentId() == null ? null : new Ref(p.getTreatmentId(), treatmentNames.get(p.getTreatmentId())));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
