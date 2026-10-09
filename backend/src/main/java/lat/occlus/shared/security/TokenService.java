package lat.occlus.shared.security;

import java.time.Instant;
import lat.occlus.user.AppUser;
import lombok.RequiredArgsConstructor;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class TokenService {

    public static final String CLAIM_CLINIC = "clinic_id";
    public static final String CLAIM_ROLE = "role";
    /** Presente (true) solo si el usuario debe cambiar su contraseña temporal. */
    public static final String CLAIM_PWD_CHANGE = "pcr";
    /** Identificador de la sesión (fila de user_session): permite revocar el token antes de que venza. */
    public static final String CLAIM_SESSION = "sid";

    private final JwtEncoder encoder;
    private final JwtProperties props;

    public IssuedToken issue(AppUser user, java.util.UUID sessionId) {
        Instant now = Instant.now();
        Instant expiresAt = now.plus(props.ttl());
        var builder = JwtClaimsSet.builder()
                .issuer("occlus")
                .issuedAt(now)
                .expiresAt(expiresAt)
                .subject(user.getId().toString())
                .claim(CLAIM_SESSION, sessionId.toString())
                .claim(CLAIM_CLINIC, user.getClinicId().toString())
                .claim(CLAIM_ROLE, user.getRole().name());
        if (user.isPasswordChangeRequired()) builder.claim(CLAIM_PWD_CHANGE, true);
        JwtClaimsSet claims = builder.build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        String token = encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
        return new IssuedToken(token, expiresAt);
    }

    public record IssuedToken(String value, Instant expiresAt) {}
}
