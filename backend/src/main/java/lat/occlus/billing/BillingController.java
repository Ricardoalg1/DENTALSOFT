package lat.occlus.billing;

import lat.occlus.platform.AppModule;
import lat.occlus.platform.RequiresModule;

import static lat.occlus.billing.BillingDtos.*;

import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lat.occlus.shared.security.AuthUser;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

/** Primer alcance: facturación por administradores, con acceso clínico ya autorizado. */
@RequiresModule(AppModule.BILLING_RIPS)
@RestController @RequiredArgsConstructor @PreAuthorize("hasRole('ADMIN')")
public class BillingController {
    private final BillingService billing;
    private final ElectronicInvoiceProvider provider;

    @GetMapping("/api/billing/profile")
    ResponseEntity<Issuer> profile(@AuthenticationPrincipal Jwt jwt) {
        var p=billing.profile(AuthUser.from(jwt).clinicId());
        return p==null?ResponseEntity.noContent().build():ResponseEntity.ok(p);
    }
    @PutMapping("/api/billing/profile")
    Issuer profile(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody Issuer req) { return billing.saveProfile(AuthUser.from(jwt),req); }
    @GetMapping("/api/billing/provider")
    ProviderStatus provider(@AuthenticationPrincipal Jwt jwt) { return provider.status(AuthUser.from(jwt).clinicId()); }
    @GetMapping("/api/invoices")
    List<Summary> list(@AuthenticationPrincipal Jwt jwt) { return billing.list(AuthUser.from(jwt).clinicId()); }
    @GetMapping("/api/treatment-plans/{id}/billable-items")
    List<UUID> eligibleItems(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) { return billing.eligibleItems(AuthUser.from(jwt).clinicId(),id); }
    @GetMapping("/api/invoices/{id}")
    InvoiceResponse get(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) { return billing.get(AuthUser.from(jwt).clinicId(),id); }
    @PostMapping("/api/invoices") @ResponseStatus(HttpStatus.CREATED)
    InvoiceResponse create(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody CreateRequest req) { return billing.create(AuthUser.from(jwt),req); }
    @PutMapping("/api/invoices/{id}/rips-user")
    InvoiceResponse user(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@Valid @RequestBody RipsUser req) { return billing.saveUser(AuthUser.from(jwt),id,req); }
    @GetMapping("/api/invoices/{id}/clinical-notes")
    List<NoteOption> notes(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) { return billing.signedNotes(AuthUser.from(jwt).clinicId(),id); }
    @PutMapping("/api/invoices/{id}/items/{sourceId}/rips")
    InvoiceResponse service(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@PathVariable UUID sourceId,@Valid @RequestBody ServiceRips req) { return billing.saveService(AuthUser.from(jwt),id,sourceId,req); }
    @PostMapping("/api/invoices/{id}/prepare")
    InvoiceResponse prepare(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) { return billing.prepare(AuthUser.from(jwt),id); }
    @PostMapping("/api/invoices/{id}/cancel")
    InvoiceResponse cancel(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@Valid @RequestBody CancelRequest req) { return billing.cancel(AuthUser.from(jwt),id,req.reason()); }
    @GetMapping("/api/invoices/{id}/rips-preview")
    RipsPreview preview(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) { return billing.preview(AuthUser.from(jwt).clinicId(),id); }
}
