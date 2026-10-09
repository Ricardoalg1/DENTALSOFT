package lat.occlus.platform;

import java.math.BigDecimal;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import lat.occlus.shared.web.BadRequestException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Lectura del catálogo de planes. */
@Component
@RequiredArgsConstructor
public class PlanCatalog {

    public record Plan(String code, String name, Integer maxUsers, BigDecimal priceMonthly, BigDecimal priceAnnual,
                       Set<AppModule> modules, boolean active, int sortOrder) {

        /** Precio de lista para el ciclo; null si el plan se cotiza por cliente. */
        public BigDecimal priceFor(BillingCycle cycle) {
            return cycle == BillingCycle.MONTHLY ? priceMonthly : priceAnnual;
        }
    }

    private final JdbcTemplate db;

    public List<Plan> all() {
        return db.query("select * from subscription_plan order by sort_order, code", (rs, i) -> new Plan(
                rs.getString("code"), rs.getString("name"), (Integer) rs.getObject("max_users"),
                rs.getBigDecimal("price_monthly"), rs.getBigDecimal("price_annual"),
                Entitlements.modules(rs.getArray("modules")), rs.getBoolean("active"), rs.getInt("sort_order")));
    }

    public Optional<Plan> find(String code) {
        return all().stream().filter(p -> p.code().equals(code)).findFirst();
    }

    public Plan require(String code) {
        return find(code).orElseThrow(() -> new BadRequestException("El plan «%s» no existe.".formatted(code)));
    }

    /** "{A,B}" listo para insertar con {@code ?::varchar[]}. Los nombres son constantes del enum: no necesitan escape. */
    public static String pgArray(Set<AppModule> modules) {
        var sorted = EnumSet.noneOf(AppModule.class);
        sorted.addAll(modules);
        return "{" + String.join(",", sorted.stream().map(Enum::name).toList()) + "}";
    }
}
