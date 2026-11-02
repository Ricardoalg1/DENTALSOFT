package lat.occlus.messaging;

import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lat.occlus.appointment.VisitType;
import lat.occlus.messaging.AppointmentInvites.Invite;
import lat.occlus.messaging.AppointmentInvites.TemplateRequest;
import lat.occlus.messaging.AppointmentInvites.TemplateView;
import lat.occlus.shared.security.AuthUser;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Invitaciones a citas por WhatsApp Web (enlace wa.me). Parte del plan base: no usa el API de Meta. */
@RestController
@RequiredArgsConstructor
public class AppointmentInviteController {

    private final AppointmentInvites invites;

    @GetMapping("/api/appointments/{id}/whatsapp-invite")
    Invite invite(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return invites.invite(AuthUser.from(jwt).clinicId(), id);
    }

    @GetMapping("/api/appointment-messages")
    List<TemplateView> templates(@AuthenticationPrincipal Jwt jwt) {
        return invites.templates(AuthUser.from(jwt).clinicId());
    }

    @GetMapping("/api/appointment-messages/placeholders")
    Map<String, String> placeholders() {
        return AppointmentInvites.PLACEHOLDERS;
    }

    @PutMapping("/api/appointment-messages/{type}")
    @PreAuthorize("hasRole('ADMIN')")
    TemplateView save(@AuthenticationPrincipal Jwt jwt, @PathVariable VisitType type,
                      @Valid @RequestBody TemplateRequest req) {
        return invites.save(AuthUser.from(jwt), type, req.body());
    }

    @DeleteMapping("/api/appointment-messages/{type}")
    @PreAuthorize("hasRole('ADMIN')")
    TemplateView reset(@AuthenticationPrincipal Jwt jwt, @PathVariable VisitType type) {
        return invites.reset(AuthUser.from(jwt).clinicId(), type);
    }
}
