package lat.occlus.treatment;

import java.util.List;
import java.util.UUID;
import lat.occlus.shared.web.ConflictException;
import lat.occlus.shared.web.NotFoundException;
import lat.occlus.treatment.TreatmentDtos.CupsImportRequest;
import lat.occlus.treatment.TreatmentDtos.CupsImportResponse;
import lat.occlus.treatment.TreatmentDtos.ProcedureRequest;
import lat.occlus.treatment.TreatmentDtos.ProcedureResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class PriceListService {

    private final ProcedureRepository procedures;

    @Transactional(readOnly = true)
    public List<ProcedureResponse> list(UUID clinicId, boolean includeInactive) {
        return procedures.findByClinicIdOrderByCategoryAscNameAsc(clinicId).stream()
                .filter(p -> includeInactive || p.isActive())
                .map(PriceListService::toResponse)
                .toList();
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
        p.setClinicId(clinicId);
        p.setCode(blankToNull(req.code()));
        p.setName(name);
        p.setCategory(req.category());
        p.setCupsCode(blankToNull(req.cupsCode()));
        p.setPrice(req.price());
        p.setPerTooth(req.perTooth());
        p.setTreatsCondition(req.treatsCondition());
        if (req.active() != null) p.setActive(req.active());
        return toResponse(procedures.saveAndFlush(p));
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
     * Se cobran por diente los de categorías que se hacen sobre un diente concreto.
     */
    @Transactional
    public CupsImportResponse importCups(UUID clinicId, CupsImportRequest req) {
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
            procedures.saveAndFlush(p);
            created++;
        }
        return new CupsImportResponse(created, req.items().size() - created);
    }

    private static final java.util.Set<ProcedureCategory> PER_TOOTH = java.util.EnumSet.of(
            ProcedureCategory.RESTORATIVE, ProcedureCategory.ENDODONTICS, ProcedureCategory.SURGERY,
            ProcedureCategory.PROSTHODONTICS);

    static ProcedureResponse toResponse(Procedure p) {
        return new ProcedureResponse(p.getId(), p.getCode(), p.getName(), p.getCategory(), p.getCupsCode(), p.getPrice(),
                p.isPerTooth(), p.getTreatsCondition(), p.isActive());
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
