package lat.occlus.shared.tenant;

import java.sql.Connection;
import java.sql.SQLException;
import javax.sql.DataSource;
import org.springframework.jdbc.datasource.DelegatingDataSource;

/**
 * Cada vez que se toma una conexión del pool, fija en la sesión de Postgres la clínica actual
 * (app.clinic_id) y si se omite el filtro (app.bypass_rls). Se sobrescriben en CADA préstamo,
 * así una conexión reutilizada nunca arrastra la clínica de otra petición.
 */
class TenantAwareDataSource extends DelegatingDataSource {

    private static final String SET_CONTEXT =
            "select set_config('app.clinic_id', ?, false), set_config('app.bypass_rls', ?, false)";

    TenantAwareDataSource(DataSource target) {
        super(target);
    }

    @Override
    public Connection getConnection() throws SQLException {
        return applyTenant(super.getConnection());
    }

    @Override
    public Connection getConnection(String username, String password) throws SQLException {
        return applyTenant(super.getConnection(username, password));
    }

    private static Connection applyTenant(Connection connection) throws SQLException {
        try (var ps = connection.prepareStatement(SET_CONTEXT)) {
            ps.setString(1, TenantContext.clinicId().map(Object::toString).orElse(""));
            ps.setString(2, TenantContext.isSystem() ? "on" : "off");
            ps.execute();
            return connection;
        } catch (SQLException e) {
            connection.close();
            throw e;
        }
    }
}
