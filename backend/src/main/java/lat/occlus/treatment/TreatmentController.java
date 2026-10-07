package lat.occlus.treatment;

import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.treatment.TreatmentDtos.ItemStatusRequest;
import lat.occlus.treatment.TreatmentDtos.ItemsRequest;
import lat.occlus.treatment.TreatmentDtos.PlanRequest;
import lat.occlus.treatment.TreatmentDtos.PlanResponse;
import lat.occlus.treatment.TreatmentDtos.PlanSummary;
import lat.occlus.treatment.TreatmentDtos.ProcedureRequest;
import lat.occlus.treatment.TreatmentDtos.ProcedureResponse;
import lat.occlus.treatment.TreatmentDtos.Suggestion;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Lista de precios y planes de tratamiento. Todos los roles pueden consultarlos (recepción cobra
 * y registra la aceptación); editar el presupuesto y marcar lo realizado es de los profesionales.
 */
@RestController
@RequiredArgsConstructor
public class TreatmentController {

    private final PriceListService priceList;
    private final TreatmentPlanService plansService;

    // ---------- Lista de precios ----------

    @GetMapping("/api/procedures")
    List<ProcedureResponse> procedures(@AuthenticationPrincipal Jwt jwt,
                                       @RequestParam(defaultValue = "false") boolean includeInactive) {
        return priceList.list(AuthUser.from(jwt).clinicId(), includeInactive);
    }

    @PostMapping("/api/procedures")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    ProcedureResponse createProcedure(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ProcedureRequest req) {
        return priceList.save(AuthUser.from(jwt).clinicId(), null, req);
    }

    @PutMapping("/api/procedures/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    ProcedureResponse updateProcedure(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                                      @Valid @RequestBody ProcedureRequest req) {
        return priceList.save(AuthUser.from(jwt).clinicId(), id, req);
    }

    @PostMapping("/api/procedures/examples")
    @PreAuthorize("hasRole('ADMIN')")
    List<ProcedureResponse> loadExamples(@AuthenticationPrincipal Jwt jwt) {
        return priceList.loadExamples(AuthUser.from(jwt).clinicId());
    }

    // ---------- Planes ----------

    @GetMapping("/api/patients/{patientId}/treatment-plans")
    List<PlanSummary> plans(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID patientId) {
        return plansService.list(AuthUser.from(jwt).clinicId(), patientId);
    }

    @GetMapping("/api/patients/{patientId}/treatment-suggestions")
    List<Suggestion> suggestions(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID patientId) {
        return plansService.suggestions(AuthUser.from(jwt).clinicId(), patientId);
    }

    @PostMapping("/api/patients/{patientId}/treatment-plans")
    @ResponseStatus(HttpStatus.CREATED)
    PlanResponse create(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID patientId, @Valid @RequestBody PlanRequest req) {
        return plansService.create(AuthUser.from(jwt), patientId, req);
    }

    @GetMapping("/api/treatment-plans/{id}")
    PlanResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return plansService.get(AuthUser.from(jwt).clinicId(), id);
    }

    @PutMapping("/api/treatment-plans/{id}")
    PlanResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody PlanRequest req) {
        return plansService.update(AuthUser.from(jwt), id, req);
    }

    @PostMapping("/api/treatment-plans/{id}/items")
    PlanResponse addItems(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody ItemsRequest req) {
        return plansService.addItems(AuthUser.from(jwt), id, req.items());
    }

    @DeleteMapping("/api/treatment-plans/{id}/items/{itemId}")
    PlanResponse removeItem(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @PathVariable UUID itemId) {
        return plansService.removeItem(AuthUser.from(jwt), id, itemId);
    }

    @PostMapping("/api/treatment-plans/{id}/items/{itemId}/status")
    PlanResponse itemStatus(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @PathVariable UUID itemId,
                            @Valid @RequestBody ItemStatusRequest req) {
        return plansService.setItemStatus(AuthUser.from(jwt), id, itemId, req.status());
    }

    @PostMapping("/api/treatment-plans/{id}/accept")
    PlanResponse accept(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return plansService.accept(AuthUser.from(jwt), id);
    }

    @PostMapping("/api/treatment-plans/{id}/reject")
    PlanResponse reject(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return plansService.reject(AuthUser.from(jwt), id);
    }

    @PostMapping("/api/treatment-plans/{id}/cancel")
    PlanResponse cancel(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return plansService.cancel(AuthUser.from(jwt), id);
    }
}
