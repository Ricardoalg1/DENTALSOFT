package lat.occlus.platform;

import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/**
 * Eventos del sistema y de los clientes (renovaciones, cobros fallidos, suspensiones, altas…) y, si
 * aplica, su notificación en la bandeja del equipo de plataforma.
 *
 * <p>Con {@code dedupeKey} el mismo aviso no se repite: p. ej. "la prueba termina pronto" se
 * genera una sola vez por prueba aunque el proceso corra cada pocos minutos.
 */
@Component
@RequiredArgsConstructor
public class PlatformEvents {

    private final JdbcTemplate db;
    private final ObjectMapper mapper;

    /** @return true si el evento se registró (false si ya existía con esa clave). */
    public boolean emit(String kind, Severity severity, UUID clinicId, String title, Map<String, ?> detail,
                        String dedupeKey, boolean notify) {
        String clinicName = clinicId == null ? null : db.queryForList("select name from clinic where id = ?",
                String.class, clinicId).stream().findFirst().orElse(null);
        UUID id = UUID.randomUUID();
        int inserted = db.update("""
                insert into platform_event (id, clinic_id, clinic_name, kind, severity, title, detail, dedupe_key)
                values (?, ?, ?, ?, ?, ?, ?::jsonb, ?) on conflict do nothing""",
                id, clinicId, clinicName, kind, severity.name(), title,
                mapper.writeValueAsString(detail == null ? Map.of() : detail), dedupeKey);
        if (inserted == 1 && notify) {
            db.update("insert into platform_notification (id, event_id) values (?, ?)", UUID.randomUUID(), id);
        }
        return inserted == 1;
    }
}
