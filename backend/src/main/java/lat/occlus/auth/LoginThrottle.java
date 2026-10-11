package lat.occlus.auth;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * Bloqueo temporal tras varios intentos de inicio de sesión fallidos para el mismo correo.
 * Complementa el límite por IP del proxy: frena la adivinación de contraseñas aunque cambie la IP.
 * Vive en memoria de cada instancia; con varias instancias el límite efectivo se multiplica.
 */
@Component
public class LoginThrottle {

    static final int MAX_FAILURES = 5;
    static final Duration WINDOW = Duration.ofMinutes(15);
    private static final int MAX_TRACKED = 50_000;

    private record Attempts(int failures, Instant first) {}

    private final ConcurrentHashMap<String, Attempts> failures = new ConcurrentHashMap<>();

    /** Lanza 429 si el correo está bloqueado. */
    public void check(String key) {
        var a = failures.get(key);
        if (a == null) return;
        if (a.first().plus(WINDOW).isBefore(Instant.now())) {
            failures.remove(key);
            return;
        }
        if (a.failures() >= MAX_FAILURES) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.");
        }
    }

    public void failed(String key) {
        if (failures.size() > MAX_TRACKED) failures.clear(); // evita crecer sin límite ante un ataque con correos aleatorios
        var now = Instant.now();
        failures.merge(key, new Attempts(1, now), (old, ignored) ->
                old.first().plus(WINDOW).isBefore(now) ? new Attempts(1, now) : new Attempts(old.failures() + 1, old.first()));
    }

    public void succeeded(String key) {
        failures.remove(key);
    }
}
