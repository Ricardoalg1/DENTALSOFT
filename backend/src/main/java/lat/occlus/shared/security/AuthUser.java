package lat.occlus.shared.security;

import java.util.UUID;
import lat.occlus.user.Role;
import org.springframework.security.oauth2.jwt.Jwt;

/** Usuario autenticado, reconstruido a partir de los claims del JWT. */
public record AuthUser(UUID userId, UUID clinicId, Role role) {

    public static AuthUser from(Jwt jwt) {
        return new AuthUser(
                UUID.fromString(jwt.getSubject()),
                UUID.fromString(jwt.getClaimAsString(TokenService.CLAIM_CLINIC)),
                Role.valueOf(jwt.getClaimAsString(TokenService.CLAIM_ROLE)));
    }
}
