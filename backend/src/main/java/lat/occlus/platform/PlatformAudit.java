package lat.occlus.platform;

import java.util.Map;
import java.util.UUID;
import lat.occlus.shared.security.AuthUser;
import lombok.RequiredArgsConstructor;
import org.slf4j.MDC;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/**
 * Registro de auditoría de plataforma: cada acción de un administrador sobre un cliente queda con
 * quién, cuándo, sobre qué cliente y el antes/después. Se escribe en la MISMA transacción que el
 * cambio: si el cambio se revierte, el registro también; si el registro falla, el cambio no ocurre.
 *
 * <p>Solo se agrega (la aplicación no tiene permiso de UPDATE ni DELETE sobre la tabla).
 */
@Component
@RequiredArgsConstructor
public class PlatformAudit {

    private final JdbcTemplate db;
    private final ObjectMapper mapper;

    public void record(AuthUser actor, String action, UUID clinicId, String summary, Map<String, ?> details) {
        String actorName = db.queryForObject("select full_name from app_user where id = ?", String.class, actor.userId());
        String clinicName = clinicId == null ? null : db.queryForList("select name from clinic where id = ?",
                String.class, clinicId).stream().findFirst().orElse(null);
        db.update("""
                insert into platform_audit (id, actor_id, actor_name, action, clinic_id, clinic_name, summary, details, request_id)
                values (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?)""",
                UUID.randomUUID(), actor.userId(), actorName, action, clinicId, clinicName,
                truncate(summary, 300), mapper.writeValueAsString(details == null ? Map.of() : details), MDC.get("requestId"));
    }

    private static String truncate(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max);
    }
}
