package lat.occlus.booking;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/** Apartados por IP. Solo en memoria: la dirección de quien reserva no se guarda en ninguna tabla. */
@Component
class BookingRateLimit {

    private static final int MAX_PER_HOUR = 10;
    private static final Duration WINDOW = Duration.ofHours(1);
    private static final int MAX_TRACKED = 50_000;

    private record Window(int count, Instant start) {}

    private final ConcurrentHashMap<String, Window> holds = new ConcurrentHashMap<>();

    void checkHold(String ip) {
        if (ip == null || ip.isBlank()) return;
        if (holds.size() > MAX_TRACKED) holds.clear();
        var now = Instant.now();
        var w = holds.merge(ip, new Window(1, now), (old, ignored) ->
                old.start().plus(WINDOW).isBefore(now) ? new Window(1, now) : new Window(old.count() + 1, old.start()));
        if (w.count() > MAX_PER_HOUR) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Demasiados intentos. Espera un rato antes de volver a intentarlo.");
        }
    }
}
