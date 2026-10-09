package lat.occlus.platform;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.util.EnumSet;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Qué puede hacer una clínica según su suscripción. Se consulta en cada petición (una lectura por
 * clave primaria): así suspender o quitar un módulo surte efecto de inmediato, también para
 * sesiones ya iniciadas, sin esperar a que venza el JWT.
 *
 * <p>La lectura respeta RLS: una clínica solo ve su propia fila; el modo sistema ve cualquiera.
 */
@Service
@RequiredArgsConstructor
public class Entitlements {

    private static final String SELECT = """
            select cs.*, sp.name as plan_name
            from clinic_subscription cs join subscription_plan sp on sp.code = cs.plan_code""";

    private final JdbcTemplate db;
    private final PlatformProperties props;

    public Optional<Subscription> find(UUID clinicId) {
        return db.query(SELECT + " where cs.clinic_id = ?", Entitlements::map, clinicId).stream().findFirst();
    }

    public Duration grace() {
        return Duration.ofDays(props.graceDays());
    }

    /** Lanza {@link EntitlementException} si la clínica no puede usar la aplicación o el módulo. */
    public Subscription require(UUID clinicId, AppModule module) {
        var sub = find(clinicId).orElseThrow(() -> new EntitlementException(EntitlementException.SUBSCRIPTION_INACTIVE,
                "Tu clínica no tiene una suscripción activa. Comunícate con Occlus.", null));
        var access = sub.access(Instant.now(), grace());
        if (!access.allowed()) {
            throw new EntitlementException(EntitlementException.SUBSCRIPTION_INACTIVE, inactiveMessage(access.reason()), null);
        }
        if (module != null && !sub.has(module)) {
            throw new EntitlementException(EntitlementException.MODULE_DISABLED,
                    "El módulo «%s» no está incluido en el plan de tu clínica.".formatted(module.label()), module);
        }
        return sub;
    }

    /** Sin lanzar excepción: para procesos de fondo (recordatorios, webhooks). */
    public boolean allows(UUID clinicId, AppModule module) {
        return find(clinicId)
                .filter(s -> s.access(Instant.now(), grace()).allowed())
                .filter(s -> module == null || s.has(module))
                .isPresent();
    }

    public static String inactiveMessage(String reason) {
        return switch (reason == null ? "" : reason) {
            case "SUSPENDED" -> "La suscripción de tu clínica está suspendida. Comunícate con Occlus para reactivarla.";
            case "CANCELLED" -> "La suscripción de tu clínica fue cancelada. Comunícate con Occlus si deseas retomarla.";
            case "EXPIRED" -> "El periodo de tu suscripción terminó. Comunícate con Occlus para renovarla.";
            default -> "Tu clínica no tiene una suscripción activa. Comunícate con Occlus.";
        };
    }

    static Subscription map(ResultSet rs, int row) throws SQLException {
        return new Subscription(rs.getObject("clinic_id", UUID.class), rs.getString("plan_code"), rs.getString("plan_name"),
                SubscriptionStatus.valueOf(rs.getString("status")), BillingCycle.valueOf(rs.getString("billing_cycle")),
                rs.getBigDecimal("price"), (Integer) rs.getObject("max_users"), modules(rs.getArray("modules")),
                instant(rs, "trial_ends_at"), instant(rs, "current_period_start"), instant(rs, "current_period_end"),
                rs.getBoolean("cancel_at_period_end"), instant(rs, "past_due_since"), instant(rs, "suspended_at"),
                instant(rs, "cancelled_at"));
    }

    static Set<AppModule> modules(Array array) throws SQLException {
        var set = EnumSet.noneOf(AppModule.class);
        if (array != null) for (Object o : (Object[]) array.getArray()) set.add(AppModule.valueOf(o.toString()));
        return set;
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        var t = rs.getTimestamp(column);
        return t == null ? null : t.toInstant();
    }
}
