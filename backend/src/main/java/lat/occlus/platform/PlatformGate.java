package lat.occlus.platform;

import java.util.UUID;
import java.util.function.Supplier;
import lat.occlus.marketing.MarketingProperties;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.tenant.TenantContext;
import lat.occlus.shared.web.ForbiddenException;
import lat.occlus.user.Role;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Autoriza a los administradores de plataforma y ejecuta su trabajo en modo sistema.
 *
 * <p>Quién es administrador de plataforma lo define la lista explícita de UUID en la configuración
 * (OCCLUS_PLATFORM_ADMIN_IDS, la misma del CRM): ni un rol de clínica ni ninguna pantalla pueden
 * otorgarlo. Además de la lista se vuelve a comprobar en la base de datos que el usuario siga
 * activo y con rol ADMIN, para que un token emitido antes de una baja no conserve el privilegio.
 */
@Component
@RequiredArgsConstructor
public class PlatformGate {

    private final MarketingProperties config;
    private final JdbcTemplate db;

    /** Usuarios de plataforma configurados (para proteger sus cuentas de una suspensión accidental). */
    public java.util.Set<UUID> platformAdminIds() {
        return config.adminUserIds() == null ? java.util.Set.of() : config.adminUserIds();
    }

    /** Solo la lista y el rol del token: para decidir qué mostrar (no autoriza acciones). */
    public boolean isListed(UUID userId, Role role) {
        return role == Role.ADMIN && config.adminUserIds() != null && config.adminUserIds().contains(userId);
    }

    /**
     * Autoriza y ejecuta {@code action} en modo sistema. Debe llamarse fuera de una transacción:
     * las operaciones de los almacenes abren la suya ya dentro del contexto de sistema.
     */
    public <T> T call(AuthUser me, Supplier<T> action) {
        require(me);
        return TenantContext.callAsSystem(action);
    }

    public void run(AuthUser me, Runnable action) {
        call(me, () -> {
            action.run();
            return null;
        });
    }

    private void require(AuthUser me) {
        if (!isListed(me.userId(), me.role())) {
            throw new ForbiddenException("Esta sección es exclusiva del equipo de Occlus.");
        }
        boolean stillAdmin = TenantContext.callAsSystem(() -> Boolean.TRUE.equals(db.queryForObject(
                "select exists(select 1 from app_user where id = ? and active and role = 'ADMIN')",
                Boolean.class, me.userId())));
        if (!stillAdmin) throw new ForbiddenException("Esta sección es exclusiva del equipo de Occlus.");
    }
}
