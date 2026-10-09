package lat.occlus.shared.security;

import java.util.UUID;
import lat.occlus.shared.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

/**
 * Comprueba en la base de datos, en cada petición, que el token siga valiendo: la sesión existe, no
 * fue cerrada ni venció, el usuario sigue activo y su rol y clínica son los que dice el token.
 * La firma del JWT prueba quién lo emitió; esto prueba que SIGUE siendo válido.
 *
 * <p>Una lectura por clave primaria. Falla cerrado: si algo no cuadra, 401.
 */
@Component
@RequiredArgsConstructor
public class SessionValidator implements OAuth2TokenValidator<Jwt> {

    private static final OAuth2TokenValidatorResult REJECTED = OAuth2TokenValidatorResult.failure(
            new OAuth2Error("invalid_token", "La sesión terminó. Inicia sesión de nuevo.", null));

    private final JdbcTemplate db;

    @Override
    public OAuth2TokenValidatorResult validate(Jwt jwt) {
        UUID sid;
        UUID user;
        try {
            sid = UUID.fromString(jwt.getClaimAsString(TokenService.CLAIM_SESSION));
            user = UUID.fromString(jwt.getSubject());
        } catch (RuntimeException e) {
            return REJECTED; // sin sid (token anterior a las sesiones) o malformado
        }
        String role = jwt.getClaimAsString(TokenService.CLAIM_ROLE);
        String clinic = jwt.getClaimAsString(TokenService.CLAIM_CLINIC);
        // Corre antes de que se fije la clínica de la petición: lectura en modo sistema, solo de esta fila.
        var rows = TenantContext.callAsSystem(() -> db.queryForList("""
                select u.role, u.clinic_id::text as clinic_id
                from user_session s join app_user u on u.id = s.user_id
                where s.id = ? and s.user_id = ? and s.revoked_at is null and s.expires_at > now() and u.active""",
                sid, user));
        if (rows.isEmpty()) return REJECTED;
        var row = rows.getFirst();
        return row.get("role").equals(role) && row.get("clinic_id").equals(clinic)
                ? OAuth2TokenValidatorResult.success() : REJECTED;
    }
}
