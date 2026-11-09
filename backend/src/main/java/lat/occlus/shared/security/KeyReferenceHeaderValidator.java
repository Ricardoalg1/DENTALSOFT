package lat.occlus.shared.security;

import java.util.List;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * Rechaza tokens cuya cabecera intenta indicar qué llave usar ("kid", "jku", "jwk", "x5u", "x5c").
 *
 * <p>El decodificador ya ignora esas cabeceras (usa siempre la llave fija del servidor), así que un token
 * con ellas no puede falsificarse. Pero Occlus nunca las emite: si llegan, el token fue fabricado o
 * manipulado por alguien, y es mejor cortarlo explícitamente que depender de que se ignoren. Defensa en
 * profundidad contra la inyección del parámetro "kid" (recorrido de rutas, SQL, llave vacía).
 */
final class KeyReferenceHeaderValidator implements OAuth2TokenValidator<Jwt> {

    private static final List<String> FORBIDDEN = List.of("kid", "jku", "jwk", "x5u", "x5c");

    private static final OAuth2TokenValidatorResult REJECTED = OAuth2TokenValidatorResult.failure(
            new OAuth2Error("invalid_token", "Token no válido.", null));

    @Override
    public OAuth2TokenValidatorResult validate(Jwt jwt) {
        for (String header : FORBIDDEN) {
            if (jwt.getHeaders().containsKey(header)) return REJECTED;
        }
        return OAuth2TokenValidatorResult.success();
    }
}
