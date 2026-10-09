package lat.occlus.cash;

import lat.occlus.platform.AppModule;
import lat.occlus.platform.RequiresModule;

import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lat.occlus.cash.CashDtos.AccountResponse;
import lat.occlus.cash.CashDtos.CloseSessionRequest;
import lat.occlus.cash.CashDtos.OpenSessionRequest;
import lat.occlus.cash.CashDtos.PaymentRequest;
import lat.occlus.cash.CashDtos.PaymentResponse;
import lat.occlus.cash.CashDtos.SessionResponse;
import lat.occlus.cash.CashDtos.VoidRequest;
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
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Caja y pagos. Abrir y cerrar caja: administrador y recepción. Cobrar: además el odontólogo
 * (clínicas pequeñas). Anular un pago: solo el administrador.
 */
@RequiresModule(AppModule.TREATMENTS_CASH)
@RestController
@RequiredArgsConstructor
public class CashController {

    static final String CAN_COLLECT = "hasAnyRole('ADMIN', 'RECEPTION', 'DENTIST')";
    static final String CAN_MANAGE_CASH = "hasAnyRole('ADMIN', 'RECEPTION')";

    private final CashService cash;
    private final PaymentService paymentsService;

    // ---------- Caja ----------

    @GetMapping("/api/cash-sessions")
    @PreAuthorize(CAN_COLLECT)
    List<SessionResponse> sessions(@AuthenticationPrincipal Jwt jwt) {
        return cash.recent(AuthUser.from(jwt).clinicId());
    }

    @GetMapping("/api/cash-sessions/{id}")
    @PreAuthorize(CAN_MANAGE_CASH)
    SessionResponse session(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return cash.get(AuthUser.from(jwt).clinicId(), id);
    }

    @PostMapping("/api/cash-sessions")
    @PreAuthorize(CAN_MANAGE_CASH)
    @ResponseStatus(HttpStatus.CREATED)
    SessionResponse open(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody OpenSessionRequest req) {
        return cash.open(AuthUser.from(jwt), req.siteId(), req.openingAmount());
    }

    @PostMapping("/api/cash-sessions/{id}/close")
    @PreAuthorize(CAN_MANAGE_CASH)
    SessionResponse close(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                          @Valid @RequestBody CloseSessionRequest req) {
        return cash.close(AuthUser.from(jwt), id, req.countedCash(), req.notes());
    }

    // ---------- Pagos ----------

    @GetMapping("/api/patients/{patientId}/payments")
    @PreAuthorize(CAN_COLLECT)
    List<PaymentResponse> patientPayments(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID patientId) {
        return paymentsService.byPatient(AuthUser.from(jwt).clinicId(), patientId);
    }

    @GetMapping("/api/patients/{patientId}/account")
    @PreAuthorize(CAN_COLLECT)
    AccountResponse account(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID patientId) {
        return paymentsService.account(AuthUser.from(jwt).clinicId(), patientId);
    }

    @PostMapping("/api/patients/{patientId}/payments")
    @PreAuthorize(CAN_COLLECT)
    @ResponseStatus(HttpStatus.CREATED)
    PaymentResponse register(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID patientId,
                             @Valid @RequestBody PaymentRequest req) {
        return paymentsService.register(AuthUser.from(jwt), patientId, req);
    }

    @GetMapping("/api/payments/{id}")
    @PreAuthorize(CAN_COLLECT)
    PaymentResponse payment(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return paymentsService.get(AuthUser.from(jwt).clinicId(), id);
    }

    @PostMapping("/api/payments/{id}/void")
    @PreAuthorize("hasRole('ADMIN')")
    PaymentResponse voidPayment(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody VoidRequest req) {
        return paymentsService.voidPayment(AuthUser.from(jwt), id, req.reason());
    }
}
