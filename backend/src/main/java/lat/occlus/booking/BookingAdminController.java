package lat.occlus.booking;

import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lat.occlus.booking.BookingDtos.ConfirmRequest;
import lat.occlus.booking.BookingDtos.PendingCount;
import lat.occlus.booking.BookingDtos.RejectRequest;
import lat.occlus.booking.BookingDtos.RequestView;
import lat.occlus.booking.BookingDtos.SettingsRequest;
import lat.occlus.booking.BookingDtos.SettingsResponse;
import lat.occlus.shared.security.AuthUser;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Incluido en todos los planes. La configuración es del administrador; las solicitudes, también de recepción. */
@RestController
@RequestMapping("/api/online-booking")
@RequiredArgsConstructor
public class BookingAdminController {

    private final BookingAdminService service;

    @GetMapping("/settings")
    @PreAuthorize("hasRole('ADMIN')")
    SettingsResponse settings(@AuthenticationPrincipal Jwt jwt) {
        return service.settings(AuthUser.from(jwt).clinicId());
    }

    @PutMapping("/settings")
    @PreAuthorize("hasRole('ADMIN')")
    SettingsResponse save(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody SettingsRequest req) {
        return service.save(AuthUser.from(jwt).clinicId(), req);
    }

    @GetMapping("/requests/count")
    PendingCount count(@AuthenticationPrincipal Jwt jwt) {
        return new PendingCount(service.pendingCount(AuthUser.from(jwt).clinicId()));
    }

    @GetMapping("/requests")
    @PreAuthorize("hasAnyRole('ADMIN','RECEPTION')")
    List<RequestView> requests(@AuthenticationPrincipal Jwt jwt) {
        return service.pending(AuthUser.from(jwt).clinicId());
    }

    @GetMapping("/requests/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','RECEPTION')")
    RequestView request(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return service.get(AuthUser.from(jwt).clinicId(), id);
    }

    @PostMapping("/requests/{id}/confirm")
    @PreAuthorize("hasAnyRole('ADMIN','RECEPTION')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void confirm(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody ConfirmRequest req) {
        service.confirm(AuthUser.from(jwt), id, req.patientId());
    }

    @PostMapping("/requests/{id}/reject")
    @PreAuthorize("hasAnyRole('ADMIN','RECEPTION')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void reject(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody RejectRequest req) {
        service.reject(AuthUser.from(jwt), id, req.reason());
    }
}
