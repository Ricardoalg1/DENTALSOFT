package lat.occlus.auth;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import lat.occlus.shared.tenant.TenantContext;
import lat.occlus.shared.web.BadRequestException;
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
 * Recuperar la contraseña por correo con un enlace de un solo uso. En la base solo queda el hash del token.
 * La recuperación no apaga la verificación en dos pasos: quien controle el correo de otra persona no entra.
 */
@Service
@RequiredArgsConstructor
public class PasswordResetService {

    public record Inspection(boolean valid, boolean twoFactorRequired) {}

    static final Duration TOKEN_TTL = Duration.ofMinutes(30);
    static final int MAX_PER_HOUR = 3;
    static final int MAX_CODE_ATTEMPTS = 5;
    private static final String INVALID = "El enlace no es válido o ya venció. Solicita uno nuevo.";

    private record Pending(UUID id, UUID userId, UUID clinicId, String email, int attempts) {}

    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    private final AppUserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final SessionService sessions;
    private final TwoFactorService twoFactor;
    private final SecurityEvents events;
    private final AccountMail mail;
    private final LoginThrottle throttle;

    /**
     * Responde igual exista o no el correo: todo el trabajo (buscar, crear el token, enviar) ocurre en otro
     * hilo, así que ni la respuesta ni su tiempo revelan si la cuenta existe.
     */
    public void request(String rawEmail) {
        if (!mail.available()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "La recuperación por correo aún no está disponible. Pide ayuda al administrador de tu clínica.");
        }
        String email = AppUser.normalizeEmail(rawEmail);
        mail.submit(() -> TenantContext.callAsSystem(() -> {
            users.findByEmail(email).filter(AppUser::isActive).ifPresent(this::issue);
            return null;
        }));
    }

    private void issue(AppUser user) {
        Integer recent = db.queryForObject(
                "select count(*) from password_reset_token where user_id = ? and created_at > now() - interval '1 hour'", Integer.class, user.getId());
        if (recent != null && recent >= MAX_PER_HOUR) return; // evita usar Occlus para llenar el buzón de alguien
        String token = OpaqueTokens.newToken();
        tx.executeWithoutResult(s -> {
            // Solo el último enlace sirve.
            db.update("update password_reset_token set used_at = now() where user_id = ? and used_at is null", user.getId());
            db.update("insert into password_reset_token (user_id, clinic_id, token_hash, expires_at) values (?, ?, ?, ?)",
                    user.getId(), user.getClinicId(), OpaqueTokens.hash(token), Timestamp.from(Instant.now().plus(TOKEN_TTL)));
            events.record(user.getId(), user.getClinicId(), SecurityEvents.RESET_REQUESTED);
        });
        mail.deliver(user.getEmail(), "Restablece tu contraseña de Occlus", """
                Recibimos una solicitud para restablecer la contraseña de tu cuenta.

                Abre este enlace para elegir una nueva. Vence en %d minutos y solo funciona una vez:
                %s

                Si no la pediste, ignora este mensaje: tu contraseña sigue igual.""".formatted(TOKEN_TTL.toMinutes(), mail.resetLink(token)));
    }

    /** Para que la pantalla sepa si debe pedir también el código. Solo quien tiene el enlace lo averigua. */
    public Inspection inspect(String token) {
        return TenantContext.callAsSystem(() -> {
            var pending = find(token);
            return pending == null ? new Inspection(false, false) : new Inspection(true, twoFactor.isEnabled(pending.userId()));
        });
    }

    public void confirm(String token, String newPassword, String code) {
        TenantContext.callAsSystem(() -> {
            var pending = find(token);
            if (pending == null) throw new BadRequestException(INVALID);
            // La contraseña se valida primero: un error de digitación no debe gastar el código de 30 s.
            PasswordPolicy.check(newPassword, pending.email());
            if (twoFactor.isEnabled(pending.userId())) verifyCode(pending, code);
            String newHash = passwordEncoder.encode(newPassword);
            tx.executeWithoutResult(s -> {
                // Atómico: dos envíos simultáneos del mismo enlace no pueden ganar los dos.
                int taken = db.update("update password_reset_token set used_at = now() where id = ? and used_at is null and expires_at > now()", pending.id());
                if (taken == 0) throw new BadRequestException(INVALID);
                db.update("update password_reset_token set used_at = now() where user_id = ? and used_at is null", pending.userId());
                db.update("update app_user set password_hash = ?, password_change_required = false where id = ? and active", newHash, pending.userId());
                db.update("delete from login_challenge where user_id = ?", pending.userId());
                // Cierra todo: quien estuviera dentro con la contraseña anterior queda fuera.
                sessions.revokeAll(pending.userId(), null, "PASSWORD_RESET");
                events.record(pending.userId(), pending.clinicId(), SecurityEvents.RESET_COMPLETED);
            });
            return null;
        });
        // Fuera del bloque anterior: solo se llega aquí si el cambio quedó guardado.
        var email = TenantContext.callAsSystem(() -> db.queryForList(
                "select u.email from password_reset_token t join app_user u on u.id = t.user_id where t.token_hash = ?", String.class, OpaqueTokens.hash(token)));
        email.stream().findFirst().ifPresent(address -> {
            throttle.succeeded(address);
            mail.notice(address, "Tu contraseña de Occlus cambió",
                    "La contraseña de tu cuenta se cambió y cerramos todas las sesiones abiertas. Si no fuiste tú, avísanos de inmediato.");
        });
    }

    private void verifyCode(Pending pending, String code) {
        if (code == null || code.isBlank()) throw new BadRequestException("Escribe el código de tu app autenticadora o uno de respaldo.");
        try {
            twoFactor.verify(pending.userId(), pending.clinicId(), code);
        } catch (BadRequestException | ResponseStatusException e) {
            // Tras varios códigos malos el enlace se quema, además del bloqueo de la cuenta.
            db.update("""
                    update password_reset_token set attempts = attempts + 1,
                    used_at = case when attempts + 1 >= ? then now() else used_at end where id = ?""", MAX_CODE_ATTEMPTS, pending.id());
            throw e;
        }
    }

    private Pending find(String token) {
        var rows = db.query("""
                select t.id, t.user_id, t.clinic_id, u.email, t.attempts
                from password_reset_token t join app_user u on u.id = t.user_id
                where t.token_hash = ? and t.used_at is null and t.expires_at > now() and u.active""",
                (rs, i) -> new Pending(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getObject(3, UUID.class), rs.getString(4), rs.getInt(5)),
                OpaqueTokens.hash(token));
        return rows.isEmpty() ? null : rows.getFirst();
    }

    @Scheduled(cron = "0 45 3 * * *")
    void cleanup() {
        TenantContext.callAsSystem(() -> db.update("delete from password_reset_token where expires_at < now() - interval '7 days'"));
    }
}
