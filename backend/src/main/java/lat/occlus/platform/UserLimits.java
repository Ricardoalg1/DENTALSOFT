package lat.occlus.platform;

import java.util.UUID;
import lat.occlus.shared.web.ConflictException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Límite de usuarios activos del plan, aplicado en el backend. */
@Component
@RequiredArgsConstructor
public class UserLimits {

    private final JdbcTemplate db;
    private final Entitlements entitlements;

    /**
     * Debe llamarse dentro de la misma transacción que crea o reactiva al usuario. El candado
     * (por clínica, se libera al terminar la transacción) hace que dos altas simultáneas no puedan
     * pasarse del límite: la segunda espera, cuenta de nuevo y falla si ya no cabe.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void lockAndCheck(UUID clinicId, int adding) {
        db.queryForList("select pg_advisory_xact_lock(hashtextextended(?, 0))", "users:" + clinicId);
        Integer max = entitlements.find(clinicId).map(Subscription::maxUsers).orElse(null);
        if (max == null) return;
        long active = db.queryForObject("select count(*) from app_user where clinic_id = ? and active", Long.class, clinicId);
        if (active + adding > max) {
            throw new ConflictException(
                    "El plan de tu clínica permite hasta %d usuarios activos. Desactiva a alguien o solicita un plan mayor."
                            .formatted(max));
        }
    }
}
