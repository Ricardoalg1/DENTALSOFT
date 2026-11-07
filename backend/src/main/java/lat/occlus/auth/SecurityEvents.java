package lat.occlus.auth;

import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Bitácora de solo inserción de lo que afecta el acceso a una cuenta. Nunca guarda tokens, códigos ni contraseñas. */
@Component
@RequiredArgsConstructor
class SecurityEvents {

    static final String RESET_REQUESTED = "PASSWORD_RESET_REQUESTED";
    static final String RESET_COMPLETED = "PASSWORD_RESET_COMPLETED";
    static final String PASSWORD_CHANGED = "PASSWORD_CHANGED";
    static final String ENABLED = "TWO_FACTOR_ENABLED";
    static final String DISABLED = "TWO_FACTOR_DISABLED";
    static final String CODES_REGENERATED = "RECOVERY_CODES_REGENERATED";
    static final String RECOVERY_CODE_USED = "RECOVERY_CODE_USED";
    static final String LOCKED = "TWO_FACTOR_LOCKED";

    private final JdbcTemplate db;

    void record(UUID userId, UUID clinicId, String event) {
        db.update("insert into account_security_event (user_id, clinic_id, event) values (?, ?, ?)", userId, clinicId, event);
    }
}
