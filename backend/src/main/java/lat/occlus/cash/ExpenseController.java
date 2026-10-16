package lat.occlus.cash;

import jakarta.validation.Valid;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;
import lat.occlus.cash.CashDtos.ExpenseRequest;
import lat.occlus.cash.CashDtos.ExpenseResponse;
import lat.occlus.cash.CashDtos.VoidRequest;
import lat.occlus.platform.AppModule;
import lat.occlus.platform.RequiresModule;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.PageResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
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

/** Gastos de la clínica: los registran administración y recepción; anular es solo del administrador. */
@RequiresModule(AppModule.TREATMENTS_CASH)
@RestController
@RequiredArgsConstructor
public class ExpenseController {

    private final ExpenseService service;

    @GetMapping("/api/expenses")
    @PreAuthorize(CashController.CAN_MANAGE_CASH)
    PageResponse<ExpenseResponse> search(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) UUID siteId, @RequestParam(required = false) ExpenseCategory category,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        var today = LocalDate.now(ZoneId.of("America/Bogota"));
        return service.search(AuthUser.from(jwt).clinicId(), from == null ? today.withDayOfMonth(1) : from,
                to == null ? today : to, siteId, category, q, page, size);
    }

    @PostMapping("/api/expenses")
    @PreAuthorize(CashController.CAN_MANAGE_CASH)
    @ResponseStatus(HttpStatus.CREATED)
    ExpenseResponse register(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ExpenseRequest req) {
        return service.register(AuthUser.from(jwt), req);
    }

    @PostMapping("/api/expenses/{id}/void")
    @PreAuthorize("hasRole('ADMIN')")
    ExpenseResponse voidExpense(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody VoidRequest req) {
        return service.voidExpense(AuthUser.from(jwt), id, req.reason());
    }
}
