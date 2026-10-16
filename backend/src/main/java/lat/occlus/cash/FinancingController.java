package lat.occlus.cash;

import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lat.occlus.cash.CashDtos.FinancingRequest;
import lat.occlus.cash.CashDtos.FinancingResponse;
import lat.occlus.cash.CashDtos.FinancingStatus;
import lat.occlus.cash.CashDtos.VoidRequest;
import lat.occlus.platform.AppModule;
import lat.occlus.platform.RequiresModule;
import lat.occlus.shared.security.AuthUser;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Financiamiento (pagos a cuotas): lo consultan quienes cobran; crearlo, administración y recepción; cancelarlo, el administrador. */
@RequiresModule(AppModule.TREATMENTS_CASH)
@RestController
@RequiredArgsConstructor
public class FinancingController {

    private final FinancingService service;

    @GetMapping("/api/financings")
    @PreAuthorize(CashController.CAN_COLLECT)
    List<FinancingResponse> list(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) FinancingStatus status,
                                 @RequestParam(required = false) String q) {
        return service.list(AuthUser.from(jwt).clinicId(), status, q);
    }

    @GetMapping("/api/patients/{patientId}/financings")
    @PreAuthorize(CashController.CAN_COLLECT)
    List<FinancingResponse> byPatient(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID patientId) {
        return service.byPatient(AuthUser.from(jwt).clinicId(), patientId);
    }

    @PostMapping("/api/patients/{patientId}/financings")
    @PreAuthorize(CashController.CAN_MANAGE_CASH)
    @ResponseStatus(HttpStatus.CREATED)
    FinancingResponse create(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID patientId, @Valid @RequestBody FinancingRequest req) {
        return service.create(AuthUser.from(jwt), patientId, req);
    }

    @GetMapping("/api/financings/{id}")
    @PreAuthorize(CashController.CAN_COLLECT)
    FinancingResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return service.get(AuthUser.from(jwt).clinicId(), id);
    }

    @PostMapping("/api/financings/{id}/cancel")
    @PreAuthorize("hasRole('ADMIN')")
    FinancingResponse cancel(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody VoidRequest req) {
        return service.cancel(AuthUser.from(jwt), id, req.reason());
    }
}
