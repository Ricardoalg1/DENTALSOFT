package lat.occlus.platform;

import jakarta.validation.Valid;
import java.util.UUID;
import lat.occlus.platform.ClinicBillingDtos.CardRequest;
import lat.occlus.platform.ClinicBillingDtos.CheckoutResult;
import lat.occlus.platform.ClinicBillingDtos.CheckoutStarted;
import lat.occlus.platform.ClinicBillingDtos.RefreshCheckout;
import lat.occlus.platform.ClinicBillingDtos.StartCheckout;
import lat.occlus.platform.ClinicBillingDtos.State;
import lat.occlus.shared.security.AuthUser;
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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Pagar y gestionar la suscripción desde la propia clínica. Es la única parte que debe funcionar con
 * la suscripción suspendida (para poder pagar y reactivarse), por eso no pasa por el control de
 * módulos; sí exige sesión válida y rol de administrador. La clínica sale siempre del token.
 */
@RestController
@RequestMapping("/api/subscription")
@SkipEntitlements
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
class ClinicBillingController {

    private final ClinicBilling billing;
    private final CheckoutService checkout;

    @GetMapping
    State state(@AuthenticationPrincipal Jwt jwt) {
        return billing.state(AuthUser.from(jwt));
    }

    @PostMapping("/checkout")
    @ResponseStatus(HttpStatus.CREATED)
    CheckoutStarted start(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody StartCheckout req) {
        var s = checkout.start(AuthUser.from(jwt), req.provider());
        return new CheckoutStarted(s.checkoutId(), s.provider(), s.redirectUrl(), s.params());
    }

    @PostMapping("/checkout/{id}/refresh")
    CheckoutResult refresh(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody RefreshCheckout req) {
        var r = checkout.refresh(AuthUser.from(jwt), id, req.providerRef());
        return new CheckoutResult(r.status(), r.message());
    }

    @GetMapping("/wompi/setup")
    WompiGateway.Setup wompiSetup() {
        return billing.wompiSetup();
    }

    @PutMapping("/payment-method")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void saveCard(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CardRequest req) {
        billing.saveCard(AuthUser.from(jwt), req);
    }

    @DeleteMapping("/payment-method")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void removeCard(@AuthenticationPrincipal Jwt jwt) {
        billing.removeCard(AuthUser.from(jwt));
    }
}
