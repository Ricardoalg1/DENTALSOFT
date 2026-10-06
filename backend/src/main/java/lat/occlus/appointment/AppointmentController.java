package lat.occlus.appointment;

import jakarta.validation.Valid;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lat.occlus.appointment.AgendaDtos.AppointmentRequest;
import lat.occlus.appointment.AgendaDtos.AppointmentResponse;
import lat.occlus.appointment.AgendaDtos.StatusRequest;
import lat.occlus.shared.security.AuthUser;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class AppointmentController {

    private final AppointmentService service;

    /** Ej.: /api/appointments?from=2026-10-05T00:00:00-05:00&to=2026-10-12T00:00:00-05:00&dentistId=… */
    @GetMapping("/api/appointments")
    List<AppointmentResponse> list(@AuthenticationPrincipal Jwt jwt,
                                   @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
                                   @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to,
                                   @RequestParam(required = false) UUID dentistId,
                                   @RequestParam(required = false) UUID siteId,
                                   @RequestParam(defaultValue = "false") boolean includeCancelled) {
        return service.list(AuthUser.from(jwt).clinicId(), from, to, dentistId, siteId, includeCancelled);
    }

    @GetMapping("/api/appointments/{id}")
    AppointmentResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return service.get(AuthUser.from(jwt).clinicId(), id);
    }

    @GetMapping("/api/patients/{patientId}/appointments")
    List<AppointmentResponse> byPatient(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID patientId) {
        return service.byPatient(AuthUser.from(jwt).clinicId(), patientId);
    }

    @PostMapping("/api/appointments")
    @ResponseStatus(HttpStatus.CREATED)
    AppointmentResponse create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AppointmentRequest req) {
        var me = AuthUser.from(jwt);
        return service.create(me.clinicId(), me.userId(), req);
    }

    @PutMapping("/api/appointments/{id}")
    AppointmentResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                               @Valid @RequestBody AppointmentRequest req) {
        return service.update(AuthUser.from(jwt).clinicId(), id, req);
    }

    @PatchMapping("/api/appointments/{id}/status")
    AppointmentResponse changeStatus(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                                     @Valid @RequestBody StatusRequest req) {
        return service.changeStatus(AuthUser.from(jwt).clinicId(), id, req);
    }
}
