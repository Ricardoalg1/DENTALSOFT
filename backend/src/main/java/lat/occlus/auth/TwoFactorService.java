package lat.occlus.auth;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.tenant.TenantContext;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.ConflictException;
import lat.occlus.user.AppUser;
import lat.occlus.user.AppUserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

/**
 * Verificación en dos pasos. Un código sirve una sola vez, los fallos se cuentan en la base (sobreviven a
 * reinicios y a retos nuevos) y cada cambio exige volver a escribir la contraseña: una sesión olvidada
 * abierta no basta para apagar la protección.
 */
@Service
@RequiredArgsConstructor
public class TwoFactorService {

    public record Status(boolean enabled, Instant enabledAt, int recoveryCodesLeft, boolean available, boolean eligible) {}
    public record Setup(String secret, String otpauthUri) {}

    static final Duration SETUP_TTL = Duration.ofMinutes(15);
    static final Duration CHALLENGE_TTL = Duration.ofMinutes(5);
    static final int MAX_CHALLENGE_ATTEMPTS = 5;
    static final int FAILURES_PER_LOCK = 5;
    private static final int RECOVERY_CODES = 3;
    private static final Duration BASE_LOCK = Duration.ofMinutes(15);
    private static final Duration MAX_LOCK = Duration.ofHours(24);

    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    private final TotpCipher cipher;
    private final PasswordEncoder passwordEncoder;
    private final LoginThrottle throttle;
    private final SecurityEvents events;
    private final AccountMail mail;
    private final AppUserRepository users;
    private final SessionService sessions;
    private final lat.occlus.platform.PlatformGate platform;

    // ---------- Consulta ----------

    public Status status(AuthUser me) {
        UUID userId = me.userId();
        var enabledAt = db.query("select enabled_at from user_two_factor where user_id = ? and enabled_at is not null",
                (rs, i) -> rs.getTimestamp(1).toInstant(), userId);
        Integer left = db.queryForObject("select count(*) from user_recovery_code where user_id = ? and used_at is null",
                Integer.class, userId);
        return new Status(!enabledAt.isEmpty(), enabledAt.stream().findFirst().orElse(null), left == null ? 0 : left, cipher.available(), platform.isListed(userId, me.role()));
    }

    /** Debe llamarse con el contexto de la clínica o de sistema ya fijado. */
    boolean isEnabled(UUID userId) {
        return Boolean.TRUE.equals(db.queryForObject(
                "select exists(select 1 from user_two_factor where user_id = ? and enabled_at is not null)", Boolean.class, userId));
    }

    // ---------- Activación y cambios ----------

    public Setup setup(AuthUser me, String password) {
        // Solo el equipo de la plataforma: las clínicas entran con su contraseña.
        if (!platform.isListed(me.userId(), me.role())) {
            throw new lat.occlus.shared.web.ForbiddenException("La verificación en dos pasos es exclusiva del administrador de la plataforma.");
        }
        if (!cipher.available()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "La verificación en dos pasos aún no está configurada en el servidor.");
        }
        reauthenticate(me.userId(), password);
        if (isEnabled(me.userId())) throw new ConflictException("La verificación en dos pasos ya está activa.");
        byte[] secret = Totp.newSecret();
        db.update("""
                insert into user_two_factor (user_id, clinic_id, secret_enc, setup_expires_at) values (?, ?, ?, ?)
                on conflict (user_id) do update set secret_enc = excluded.secret_enc, setup_expires_at = excluded.setup_expires_at, updated_at = now()
                where user_two_factor.enabled_at is null""",
                me.userId(), me.clinicId(), cipher.encrypt(me.userId(), secret), Timestamp.from(Instant.now().plus(SETUP_TTL)));
        return new Setup(Totp.base32(secret), Totp.otpauthUri(secret, email(me.userId())));
    }

    /** Confirma con un primer código (prueba que la app quedó bien) y entrega los códigos de respaldo una sola vez. */
    public List<String> enable(AuthUser me, UUID currentSession, String code) {
        String key = "2fa-setup:" + me.userId();
        throttle.check(key);
        var pending = db.query("""
                select secret_enc from user_two_factor where user_id = ? and enabled_at is null and setup_expires_at > now()""",
                (rs, i) -> rs.getString(1), me.userId());
        if (pending.isEmpty()) throw new BadRequestException("La configuración venció. Empieza de nuevo.");
        var step = Totp.matchStep(cipher.decrypt(me.userId(), pending.getFirst()), code.trim(), Instant.now().getEpochSecond());
        if (step.isEmpty()) {
            throttle.failed(key);
            throw new BadRequestException("El código no es correcto. Revisa que la hora de tu teléfono esté en automático.");
        }
        throttle.succeeded(key);
        var codes = tx.execute(s -> {
            int n = db.update("""
                    update user_two_factor set enabled_at = now(), setup_expires_at = null, last_step = ?, failed_attempts = 0,
                    locked_until = null, updated_at = now() where user_id = ? and enabled_at is null""", step.getAsLong(), me.userId());
            if (n == 0) throw new ConflictException("La verificación en dos pasos ya está activa.");
            var fresh = replaceRecoveryCodes(me.userId(), me.clinicId());
            // Quien ya estuviera dentro con la contraseña filtrada queda fuera; esta sesión sigue.
            sessions.revokeAll(me.userId(), currentSession, "TWO_FACTOR_CHANGED");
            events.record(me.userId(), me.clinicId(), SecurityEvents.ENABLED);
            return fresh;
        });
        mail.notice(email(me.userId()), "Activaste la verificación en dos pasos",
                "La verificación en dos pasos quedó activa en tu cuenta de Occlus. Si no fuiste tú, cambia tu contraseña y avísanos de inmediato.");
        return codes;
    }

    public void disable(AuthUser me, UUID currentSession, String password, String code) {
        reauthenticate(me.userId(), password);
        verify(me.userId(), me.clinicId(), code);
        tx.executeWithoutResult(s -> {
            db.update("delete from user_recovery_code where user_id = ?", me.userId());
            db.update("delete from user_two_factor where user_id = ?", me.userId());
            sessions.revokeAll(me.userId(), currentSession, "TWO_FACTOR_CHANGED");
            events.record(me.userId(), me.clinicId(), SecurityEvents.DISABLED);
        });
        mail.notice(email(me.userId()), "Desactivaste la verificación en dos pasos",
                "La verificación en dos pasos se desactivó en tu cuenta de Occlus. Si no fuiste tú, cambia tu contraseña y avísanos de inmediato.");
    }

    public List<String> regenerateRecoveryCodes(AuthUser me, String password, String code) {
        reauthenticate(me.userId(), password);
        verify(me.userId(), me.clinicId(), code);
        var codes = tx.execute(s -> {
            var fresh = replaceRecoveryCodes(me.userId(), me.clinicId());
            events.record(me.userId(), me.clinicId(), SecurityEvents.CODES_REGENERATED);
            return fresh;
        });
        mail.notice(email(me.userId()), "Generaste nuevos códigos de respaldo",
                "Se generaron nuevos códigos de respaldo en tu cuenta de Occlus y los anteriores dejaron de servir. Si no fuiste tú, cambia tu contraseña y avísanos de inmediato.");
        return codes;
    }

    // ---------- Ingreso con reto ----------

    /** La contraseña ya fue correcta: abre un reto de vida corta y todavía no hay sesión. */
    String openChallenge(AppUser user) {
        String token = OpaqueTokens.newToken();
        TenantContext.callAsSystem(() -> {
            db.update("delete from login_challenge where user_id = ?", user.getId());
            return db.update("insert into login_challenge (token_hash, user_id, clinic_id, expires_at) values (?, ?, ?, ?)",
                    OpaqueTokens.hash(token), user.getId(), user.getClinicId(), Timestamp.from(Instant.now().plus(CHALLENGE_TTL)));
        });
        return token;
    }

    /** Resuelve el reto y devuelve el usuario. El reto se borra al usarlo: no sirve dos veces. */
    AppUser completeChallenge(String token, String code) {
        String hash = OpaqueTokens.hash(token);
        return TenantContext.callAsSystem(() -> {
            var expired = new BadRequestException("La verificación venció. Vuelve a ingresar.");
            var rows = db.query("select user_id, clinic_id, attempts from login_challenge where token_hash = ? and expires_at > now()",
                    (rs, i) -> new Object[] {rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getInt(3)}, hash);
            if (rows.isEmpty()) throw expired;
            UUID userId = (UUID) rows.getFirst()[0];
            UUID clinicId = (UUID) rows.getFirst()[1];
            if ((int) rows.getFirst()[2] >= MAX_CHALLENGE_ATTEMPTS) {
                db.update("delete from login_challenge where token_hash = ?", hash);
                throw expired;
            }
            try {
                verify(userId, clinicId, code);
            } catch (BadRequestException e) {
                db.update("update login_challenge set attempts = attempts + 1 where token_hash = ?", hash);
                throw e;
            }
            if (db.update("delete from login_challenge where token_hash = ?", hash) == 0) throw expired;
            return users.findById(userId).filter(AppUser::isActive).orElseThrow(() -> expired);
        });
    }

    // ---------- Verificación de un código ----------

    /**
     * Acepta un código de la app o uno de respaldo. Lanza 400 si no sirve y 429 si la cuenta está bloqueada.
     * Debe correr fuera de una transacción: el conteo de fallos tiene que quedar guardado aunque se rechace.
     */
    void verify(UUID userId, UUID clinicId, String rawCode) {
        var rows = db.query("select secret_enc, locked_until from user_two_factor where user_id = ? and enabled_at is not null",
                (rs, i) -> new Object[] {rs.getString(1), rs.getTimestamp(2)}, userId);
        if (rows.isEmpty()) throw new BadRequestException("La verificación en dos pasos no está activa.");
        var lockedUntil = (Timestamp) rows.getFirst()[1];
        if (lockedUntil != null && lockedUntil.toInstant().isAfter(Instant.now())) throw locked();

        String code = rawCode == null ? "" : rawCode.trim();
        boolean ok = code.matches("\\d{6}")
                ? consumeTotp(userId, (String) rows.getFirst()[0], code)
                : consumeRecoveryCode(userId, clinicId, code);
        if (ok) {
            db.update("update user_two_factor set failed_attempts = 0, locked_until = null, updated_at = now() where user_id = ?", userId);
            return;
        }
        registerFailure(userId, clinicId);
    }

    private boolean consumeTotp(UUID userId, String secretEnc, String code) {
        var step = Totp.matchStep(cipher.decrypt(userId, secretEnc), code, Instant.now().getEpochSecond());
        if (step.isEmpty()) return false;
        // Atómico: dos peticiones simultáneas con el mismo código no pueden ganar las dos (sin repetición).
        return db.update("update user_two_factor set last_step = ?, updated_at = now() where user_id = ? and last_step < ?",
                step.getAsLong(), userId, step.getAsLong()) == 1;
    }

    private boolean consumeRecoveryCode(UUID userId, UUID clinicId, String code) {
        String normalized = OpaqueTokens.normalizeRecoveryCode(code);
        if (normalized.length() != 16) return false;
        boolean used = db.update("update user_recovery_code set used_at = now() where user_id = ? and code_hash = ? and used_at is null",
                userId, OpaqueTokens.hash(normalized)) == 1;
        if (used) {
            events.record(userId, clinicId, SecurityEvents.RECOVERY_CODE_USED);
            mail.notice(email(userId), "Se usó un código de respaldo",
                    "Se usó uno de tus códigos de respaldo para entrar a Occlus. Si no fuiste tú, cambia tu contraseña y genera códigos nuevos de inmediato.");
        }
        return used;
    }

    /** Cada 5 fallos seguidos bloquea: 15 min, luego 30, 1 h… hasta 24 h. Solo llega aquí quien ya pasó la contraseña o el enlace. */
    private void registerFailure(UUID userId, UUID clinicId) {
        Integer failures = db.queryForObject(
                "update user_two_factor set failed_attempts = failed_attempts + 1, updated_at = now() where user_id = ? returning failed_attempts",
                Integer.class, userId);
        if (failures != null && failures % FAILURES_PER_LOCK == 0) {
            Duration lock = lockFor(failures / FAILURES_PER_LOCK);
            db.update("update user_two_factor set locked_until = ? where user_id = ?", Timestamp.from(Instant.now().plus(lock)), userId);
            events.record(userId, clinicId, SecurityEvents.LOCKED);
            mail.notice(email(userId), "Intentos fallidos en tu cuenta",
                    "Hubo varios códigos incorrectos al entrar a tu cuenta de Occlus y la bloqueamos temporalmente. Si no fuiste tú, alguien conoce tu contraseña: cámbiala cuanto antes.");
            throw locked();
        }
        throw new BadRequestException("El código no es correcto.");
    }

    static Duration lockFor(int locksSoFar) {
        Duration lock = BASE_LOCK.multipliedBy(1L << Math.min(locksSoFar - 1, 10));
        return lock.compareTo(MAX_LOCK) > 0 ? MAX_LOCK : lock;
    }

    private static ResponseStatusException locked() {
        return new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Demasiados códigos incorrectos. Espera antes de volver a intentarlo.");
    }

    private List<String> replaceRecoveryCodes(UUID userId, UUID clinicId) {
        db.update("delete from user_recovery_code where user_id = ?", userId);
        var codes = new ArrayList<String>(RECOVERY_CODES);
        for (int i = 0; i < RECOVERY_CODES; i++) {
            String code = OpaqueTokens.newRecoveryCode();
            codes.add(code);
            db.update("insert into user_recovery_code (user_id, clinic_id, code_hash) values (?, ?, ?)",
                    userId, clinicId, OpaqueTokens.hash(OpaqueTokens.normalizeRecoveryCode(code)));
        }
        return codes;
    }

    private void reauthenticate(UUID userId, String password) {
        String key = "reauth:" + userId;
        throttle.check(key);
        String hash = db.queryForObject("select password_hash from app_user where id = ?", String.class, userId);
        if (!passwordEncoder.matches(password, hash)) {
            throttle.failed(key);
            throw new BadRequestException("La contraseña no es correcta.");
        }
        throttle.succeeded(key);
    }

    private String email(UUID userId) {
        return db.queryForObject("select email from app_user where id = ?", String.class, userId);
    }

    /** Retos vencidos y configuraciones que nunca se confirmaron. */
    @Scheduled(cron = "0 40 3 * * *")
    void cleanup() {
        TenantContext.callAsSystem(() -> {
            db.update("delete from login_challenge where expires_at < now()");
            return db.update("delete from user_two_factor where enabled_at is null and setup_expires_at < now()");
        });
    }
}
