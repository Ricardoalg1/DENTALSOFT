package lat.occlus.user;

import java.util.List;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.user.UserDtos.ProfessionalResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Profesionales activos de la clínica. Lo usan todos los roles (p. ej. recepción al agendar). */
@RestController
@RequiredArgsConstructor
public class ProfessionalController {

    private final UserService service;

    @GetMapping("/api/professionals")
    List<ProfessionalResponse> list(@AuthenticationPrincipal Jwt jwt) {
        return service.professionals(AuthUser.from(jwt).clinicId());
    }
}
