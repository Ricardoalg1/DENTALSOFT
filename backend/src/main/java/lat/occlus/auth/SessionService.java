package lat.occlus.auth;

import java.sql.Timestamp;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;
import lat.occlus.shared.security.TokenService;
import lat.occlus.shared.tenant.TenantContext;
import lat.occlus.shared.web.NotFoundException;
import lat.occlus.user.AppUser;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/** Sesiones revocables: cada token emitido corresponde a una fila que se puede cerrar. */
@Service
@RequiredArgsConstructor
public class SessionService {

    public record SessionInfo(UUID id, java.time.Instant createdAt, String userAgent, boolean current) {}

    private final JdbcTemplate db;
    private final TokenService tokens;

    /** Crea la sesión y emite su token. Sirve dentro o fuera de una transacción. */
    public TokenService.IssuedToken open(AppUser user) {
        UUID sid = UUID.randomUUID();
        var token = tokens.issue(user, sid);
        inClinic(user.getClinicId(), () -> db.update("""
                insert into user_session (id, user_id, clinic_id, expires_at, user_agent) values (?, ?, ?, ?, ?)""",
                sid, user.getId(), user.getClinicId(), Timestamp.from(token.expiresAt()), userAgent()));
        return token;
    }

    public void revoke(UUID userId, UUID sessionId, String reason) {
        int n = db.update("""
                update user_session set revoked_at = now(), revoked_reason = ?
                where id = ? and user_id = ? and revoked_at is null""", reason, sessionId, userId);
        if (n == 0) throw new NotFoundException("Sesión no encontrada");
    }

    /** Cierra todas las sesiones del usuario, salvo (opcionalmente) una. Corre en la transacción o clínica actual. */
    public int revokeAll(UUID userId, UUID except, String reason) {
        return db.update("""
                update user_session set revoked_at = now(), revoked_reason = ?
                where user_id = ? and revoked_at is null and (?::uuid is null or id <> ?::uuid)""",
                reason, userId, except, except);
    }

    public List<SessionInfo> list(UUID userId, UUID current) {
        return db.query("""
                select id, created_at, user_agent from user_session
                where user_id = ? and revoked_at is null and expires_at > now() order by created_at desc""",
                (rs, i) -> new SessionInfo(rs.getObject("id", UUID.class), rs.getTimestamp("created_at").toInstant(),
                        rs.getString("user_agent"), rs.getObject("id", UUID.class).equals(current)),
                userId);
    }

    /** Las filas vencidas o cerradas hace más de una semana ya no sirven ni para consulta. */
    @Scheduled(cron = "0 30 3 * * *")
    void cleanup() {
        TenantContext.callAsSystem(() -> db.update("""
                delete from user_session
                where expires_at < now() - interval '7 days' or revoked_at < now() - interval '7 days'"""));
    }

    private static <T> T inClinicOrNow(UUID clinicId, Supplier<T> action) {
        // Dentro de una transacción el contexto de clínica ya está fijado por la petición.
        return TransactionSynchronizationManager.isActualTransactionActive() ? action.get() : TenantContext.callAs(clinicId, action);
    }

    private void inClinic(UUID clinicId, Runnable action) {
        inClinicOrNow(clinicId, () -> {
            action.run();
            return null;
        });
    }

    private static String userAgent() {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs) {
            String ua = attrs.getRequest().getHeader("User-Agent");
            if (ua != null) return ua.length() > 200 ? ua.substring(0, 200) : ua;
        }
        return null;
    }
}
