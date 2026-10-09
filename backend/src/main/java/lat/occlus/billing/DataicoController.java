package lat.occlus.billing;

import lat.occlus.platform.AppModule;
import lat.occlus.platform.RequiresModule;

import lat.occlus.shared.security.AuthUser;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RequiresModule(AppModule.BILLING_RIPS)
@RestController
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class DataicoController {
    private final DataicoInvoiceProvider dataico;

    @GetMapping("/api/billing/dataico/invoices")
    public DataicoInvoiceProvider.InvoiceLookup lookup(@AuthenticationPrincipal Jwt jwt,
            @RequestParam String number) {
        return dataico.lookup(AuthUser.from(jwt).clinicId(), number);
    }
}
