package lat.occlus.appointment;

import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lat.occlus.appointment.AgendaDtos.ScheduleRequest;
import lat.occlus.appointment.AgendaDtos.ScheduleResponse;
import lat.occlus.shared.security.AuthUser;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Horarios de atención. Todos pueden verlos (la agenda los usa); solo el administrador los edita. */
@RestController
@RequestMapping("/api/schedules")
@RequiredArgsConstructor
public class ScheduleController {

    private final ScheduleService service;

    @GetMapping
    List<ScheduleResponse> list(@AuthenticationPrincipal Jwt jwt) {
        return service.list(AuthUser.from(jwt).clinicId());
    }

    @PutMapping("/{dentistId}")
    @PreAuthorize("hasRole('ADMIN')")
    List<ScheduleResponse> replace(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID dentistId,
                                   @Valid @RequestBody ScheduleRequest req) {
        return service.replace(AuthUser.from(jwt).clinicId(), dentistId, req.blocks());
    }
}
