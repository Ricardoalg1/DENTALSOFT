package lat.occlus.treatment;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.ConflictException;
import lat.occlus.shared.web.NotFoundException;
import lat.occlus.shared.web.PageResponse;
import lat.occlus.treatment.TreatmentDtos.ImportResult;
import lat.occlus.treatment.TreatmentDtos.ImportRowError;
import lat.occlus.treatment.TreatmentDtos.TreatmentTypeRequest;
import lat.occlus.treatment.TreatmentDtos.TreatmentTypeResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Catálogo de tratamientos: CRUD, búsqueda paginada, predeterminados e importación. */
@Service
@RequiredArgsConstructor
public class TreatmentTypeService {

    private final TreatmentTypeRepository treatments;
    private final JdbcTemplate jdbc;

    @Transactional(readOnly = true)
    public List<TreatmentTypeResponse> all(UUID clinicId) {
        var counts = procedureCounts(clinicId);
        return treatments.findByClinicIdOrderByNameAsc(clinicId).stream()
                .map(t -> toResponse(t, counts.getOrDefault(t.getId(), 0L))).toList();
    }

    /** {@code active} null = todos. */
    @Transactional(readOnly = true)
    public PageResponse<TreatmentTypeResponse> search(UUID clinicId, String query, Boolean active, ProcedureCategory category,
                                                      int page, int size) {
        if (page < 0 || size < 1 || size > 100) throw new BadRequestException("Página inválida");
        String q = normalize(query);
        var filtered = all(clinicId).stream()
                .filter(t -> active == null || t.active() == active)
                .filter(t -> category == null || t.category() == category)
                .filter(t -> q.isEmpty() || normalize(t.name() + " " + (t.description() == null ? "" : t.description())).contains(q))
                .toList();
        int pages = (int) Math.ceil((double) filtered.size() / size);
        int actual = pages == 0 ? 0 : Math.min(page, pages - 1);
        var content = filtered.subList(Math.min(actual * size, filtered.size()), Math.min((actual + 1) * size, filtered.size()));
        return new PageResponse<>(content, actual, size, filtered.size(), pages);
    }

    @Transactional
    public TreatmentTypeResponse save(UUID clinicId, UUID id, TreatmentTypeRequest req) {
        String name = req.name().trim();
        treatments.findByClinicIdAndNameIgnoreCase(clinicId, name)
                .filter(t -> !t.getId().equals(id))
                .ifPresent(t -> { throw new ConflictException("Ya existe un tratamiento con ese nombre"); });
        var t = id == null ? new TreatmentType() : find(clinicId, id);
        if (id == null) {
            t.setId(UUID.randomUUID());
            t.setClinicId(clinicId);
        }
        t.setName(name);
        t.setCategory(req.category());
        t.setDescription(req.description() == null || req.description().isBlank() ? null : req.description().trim());
        if (req.active() != null) t.setActive(req.active());
        var saved = treatments.saveAndFlush(t);
        return toResponse(saved, procedureCounts(clinicId).getOrDefault(saved.getId(), 0L));
    }

    @Transactional
    public TreatmentTypeResponse setActive(UUID clinicId, UUID id, boolean active) {
        var t = find(clinicId, id);
        t.setActive(active);
        var saved = treatments.saveAndFlush(t);
        return toResponse(saved, procedureCounts(clinicId).getOrDefault(id, 0L));
    }

    /** Solo se borra un tratamiento sin procedimientos; si tiene, se desactiva. */
    @Transactional
    public void delete(UUID clinicId, UUID id) {
        var t = find(clinicId, id);
        if (procedureCounts(clinicId).getOrDefault(id, 0L) > 0) {
            throw new ConflictException("El tratamiento tiene procedimientos: desactívalo en lugar de eliminarlo");
        }
        treatments.delete(t);
    }

    /** Carga los tratamientos predeterminados que la clínica aún no tenga (por nombre). */
    @Transactional
    public ImportResult loadPresets(UUID clinicId) {
        int created = 0;
        for (var p : DefaultTreatments.PRESETS) {
            if (treatments.findByClinicIdAndNameIgnoreCase(clinicId, p.name()).isPresent()) continue;
            var t = new TreatmentType();
            t.setId(UUID.randomUUID());
            t.setClinicId(clinicId);
            t.setName(p.name());
            t.setCategory(p.category());
            treatments.save(t);
            created++;
        }
        treatments.flush();
        return new ImportResult(created, 0, DefaultTreatments.PRESETS.size() - created, List.of());
    }

    /** Importa filas (de un CSV): crea o actualiza por nombre. Las filas con errores se omiten y se informan. */
    @Transactional
    public ImportResult importRows(UUID clinicId, List<TreatmentTypeRequest> rows) {
        int created = 0, updated = 0;
        var errors = new ArrayList<ImportRowError>();
        for (int i = 0; i < rows.size(); i++) {
            var r = rows.get(i);
            if (r == null || r.name() == null || r.name().isBlank() || r.name().length() > 150 || r.category() == null) {
                errors.add(new ImportRowError(i + 2, "Nombre (máx. 150) y categoría válida son obligatorios"));
                continue;
            }
            var existing = treatments.findByClinicIdAndNameIgnoreCase(clinicId, r.name().trim());
            save(clinicId, existing.map(TreatmentType::getId).orElse(null), r);
            if (existing.isPresent()) updated++; else created++;
        }
        return new ImportResult(created, updated, 0, errors);
    }

    TreatmentType find(UUID clinicId, UUID id) {
        return treatments.findByIdAndClinicId(id, clinicId).orElseThrow(() -> new NotFoundException("Tratamiento no encontrado"));
    }

    private java.util.Map<UUID, Long> procedureCounts(UUID clinicId) {
        var map = new java.util.HashMap<UUID, Long>();
        jdbc.query("select treatment_id, count(*) from service_catalog where clinic_id = ? and treatment_id is not null group by treatment_id",
                rs -> { map.put(rs.getObject(1, UUID.class), rs.getLong(2)); }, clinicId);
        return map;
    }

    static TreatmentTypeResponse toResponse(TreatmentType t, long procedures) {
        return new TreatmentTypeResponse(t.getId(), t.getName(), t.getCategory(), t.getDescription(), t.isActive(), procedures);
    }

    static String normalize(String s) {
        if (s == null) return "";
        return java.text.Normalizer.normalize(s.trim(), java.text.Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT);
    }
}
