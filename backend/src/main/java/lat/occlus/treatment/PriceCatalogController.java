package lat.occlus.treatment;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import lat.occlus.platform.AppModule;
import lat.occlus.platform.RequiresModule;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.PageResponse;
import lat.occlus.treatment.TreatmentDtos.ActiveRequest;
import lat.occlus.treatment.TreatmentDtos.ImportResult;
import lat.occlus.treatment.TreatmentDtos.ProcedureImportRow;
import lat.occlus.treatment.TreatmentDtos.ProcedureResponse;
import lat.occlus.treatment.TreatmentDtos.TreatmentTypeRequest;
import lat.occlus.treatment.TreatmentDtos.TreatmentTypeResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Catálogo de la lista de precios: procedimientos (búsqueda, estado, borrado, importación) y tratamientos. */
@RequiresModule(AppModule.TREATMENTS_CASH)
@RestController
@Validated
@RequiredArgsConstructor
public class PriceCatalogController {

    private final PriceListService priceList;
    private final TreatmentTypeService treatments;

    // ---------- Procedimientos ----------

    /** {@code status}: active, inactive o all. */
    @GetMapping("/api/procedures/search")
    PageResponse<ProcedureResponse> searchProcedures(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "") @Size(max = 120) String q, @RequestParam(defaultValue = "all") String status,
            @RequestParam(required = false) UUID treatmentId,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return priceList.search(AuthUser.from(jwt).clinicId(), q, active(status), treatmentId, page, size);
    }

    @PatchMapping("/api/procedures/{id}/status")
    @PreAuthorize("hasRole('ADMIN')")
    ProcedureResponse procedureStatus(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody ActiveRequest req) {
        return priceList.setActive(AuthUser.from(jwt).clinicId(), id, req.active());
    }

    @DeleteMapping("/api/procedures/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteProcedure(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        priceList.delete(AuthUser.from(jwt).clinicId(), id);
    }

    @PostMapping("/api/procedures/import")
    @PreAuthorize("hasRole('ADMIN')")
    ImportResult importProcedures(@AuthenticationPrincipal Jwt jwt, @RequestBody @Size(min = 1, max = 2000) List<ProcedureImportRow> rows) {
        return priceList.importRows(AuthUser.from(jwt).clinicId(), rows);
    }

    // ---------- Tratamientos ----------

    @GetMapping("/api/treatment-types")
    List<TreatmentTypeResponse> treatmentTypes(@AuthenticationPrincipal Jwt jwt) {
        return treatments.all(AuthUser.from(jwt).clinicId());
    }

    @GetMapping("/api/treatment-types/search")
    PageResponse<TreatmentTypeResponse> searchTreatmentTypes(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "") @Size(max = 120) String q, @RequestParam(defaultValue = "all") String status,
            @RequestParam(required = false) ProcedureCategory category,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return treatments.search(AuthUser.from(jwt).clinicId(), q, active(status), category, page, size);
    }

    @PostMapping("/api/treatment-types")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    TreatmentTypeResponse createTreatmentType(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody TreatmentTypeRequest req) {
        return treatments.save(AuthUser.from(jwt).clinicId(), null, req);
    }

    @PutMapping("/api/treatment-types/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    TreatmentTypeResponse updateTreatmentType(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                                              @Valid @RequestBody TreatmentTypeRequest req) {
        return treatments.save(AuthUser.from(jwt).clinicId(), id, req);
    }

    @PatchMapping("/api/treatment-types/{id}/status")
    @PreAuthorize("hasRole('ADMIN')")
    TreatmentTypeResponse treatmentTypeStatus(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody ActiveRequest req) {
        return treatments.setActive(AuthUser.from(jwt).clinicId(), id, req.active());
    }

    @DeleteMapping("/api/treatment-types/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteTreatmentType(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        treatments.delete(AuthUser.from(jwt).clinicId(), id);
    }

    @PostMapping("/api/treatment-types/presets")
    @PreAuthorize("hasRole('ADMIN')")
    ImportResult loadPresets(@AuthenticationPrincipal Jwt jwt) {
        return treatments.loadPresets(AuthUser.from(jwt).clinicId());
    }

    @PostMapping("/api/treatment-types/import")
    @PreAuthorize("hasRole('ADMIN')")
    ImportResult importTreatmentTypes(@AuthenticationPrincipal Jwt jwt, @RequestBody @Size(min = 1, max = 2000) List<TreatmentTypeRequest> rows) {
        return treatments.importRows(AuthUser.from(jwt).clinicId(), rows);
    }

    private static Boolean active(String status) {
        return switch (status) {
            case "active" -> Boolean.TRUE;
            case "inactive" -> Boolean.FALSE;
            case "all" -> null;
            default -> throw new lat.occlus.shared.web.BadRequestException("Estado inválido");
        };
    }
}
