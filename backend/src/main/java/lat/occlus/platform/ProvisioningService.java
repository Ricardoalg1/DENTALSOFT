package lat.occlus.platform;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import lat.occlus.clinic.Clinic;
import lat.occlus.clinic.ClinicRepository;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.tenant.TenantContext;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.site.Site;
import lat.occlus.site.SiteRepository;
import lat.occlus.user.AppUser;
import lat.occlus.user.AppUserRepository;
import lat.occlus.user.Role;
import lat.occlus.user.UserDtos.CreateUserRequest;
import lat.occlus.user.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Crea un cliente completo y consistente: clínica, sede principal, administrador, suscripción y
 * datos comerciales, en UNA transacción. Lo usan el registro de prueba (autoservicio) y el panel
 * de plataforma, así los dos caminos producen exactamente lo mismo.
 */
@Service
@RequiredArgsConstructor
public class ProvisioningService {

    public record ClientData(String legalName, String contactName, String contactEmail, String contactPhone,
                             String city, String notes) {

        public static ClientData none() {
            return new ClientData(null, null, null, null, null, null);
        }
    }

    /**
     * @param trialDays        si es mayor que 0, empieza en prueba sin cobro
     * @param paymentReference si no hay prueba: referencia del primer pago ya recibido (obligatoria),
     *                         salvo en el plan INTERNAL que no se cobra
     */
    public record Request(String clinicName, String nit, String adminName, String adminEmail, String adminPassword,
                          boolean passwordChangeRequired, String planCode, BillingCycle cycle, BigDecimal price,
                          Integer maxUsers, Set<AppModule> modules, Integer trialDays, String paymentReference,
                          ClientData client, String source) {}

    public record Result(UUID clinicId, UUID adminId) {}

    private final ClinicRepository clinics;
    private final SiteRepository sites;
    private final AppUserRepository users;
    private final UserService userService;
    private final PlanCatalog plans;
    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    private final PlatformEvents events;
    private final PlatformAudit audit;

    /** {@code actor} es null cuando el cliente se registra solo. Llamar fuera de una transacción. */
    public Result provision(Request r, AuthUser actor) {
        userService.ensureEmailAvailable(r.adminEmail());
        UUID clinicId = UUID.randomUUID();

        return TenantContext.callAsSystem(() -> tx.execute(status -> {
            var plan = plans.require(r.planCode());
            if (!plan.active() && !"INTERNAL".equals(plan.code())) throw new BadRequestException("Ese plan ya no se ofrece.");
            Set<AppModule> modules = r.modules() == null || r.modules().isEmpty() ? plan.modules() : r.modules();
            var problems = AppModule.dependencyProblems(modules);
            if (!problems.isEmpty()) throw new BadRequestException(String.join(" ", problems));

            BigDecimal price = r.price() != null ? r.price() : plan.priceFor(r.cycle());
            if (price == null) {
                throw new BadRequestException("El plan «%s» se cotiza: indica el precio pactado.".formatted(plan.name()));
            }
            Integer maxUsers = r.maxUsers() != null ? r.maxUsers() : plan.maxUsers();

            clinics.save(new Clinic(clinicId, r.clinicName().trim(), blankToNull(r.nit())));
            var site = new Site();
            site.setClinicId(clinicId);
            site.setName("Sede principal");
            sites.save(site);
            AppUser admin = userService.newUser(clinicId,
                    new CreateUserRequest(r.adminEmail(), r.adminName(), Role.ADMIN, r.adminPassword(), true));
            admin.setPasswordChangeRequired(r.passwordChangeRequired());
            admin = users.save(admin);
            // El resto se inserta por JDBC: la clínica, la sede y el usuario deben existir ya en la BD.
            users.flush();

            insertSubscription(clinicId, plan, r, modules, price, maxUsers, actor);
            var c = r.client() == null ? ClientData.none() : r.client();
            db.update("""
                    insert into platform_client (clinic_id, legal_name, contact_name, contact_email, contact_phone,
                                                 city, internal_notes, source, created_by)
                    values (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    clinicId, blankToNull(c.legalName()), blankToNull(c.contactName()), blankToNull(c.contactEmail()),
                    blankToNull(c.contactPhone()), blankToNull(c.city()), blankToNull(c.notes()), r.source(),
                    actor == null ? null : actor.userId());

            boolean selfService = actor == null;
            events.emit("CLINIC_CREATED", Severity.INFO, clinicId,
                    selfService ? "Nueva clínica de prueba registrada: " + r.clinicName().trim()
                            : "Cliente creado: " + r.clinicName().trim(),
                    Map.of("plan", plan.code(), "source", r.source()), null, selfService);
            if (actor != null) {
                audit.record(actor, "CLINIC_CREATED", clinicId, "Creó al cliente " + r.clinicName().trim(),
                        Map.of("plan", plan.code(), "billingCycle", r.cycle().name(), "price", price.toPlainString(),
                                "maxUsers", String.valueOf(maxUsers), "modules", modules.stream().map(Enum::name).sorted().toList(),
                                "adminEmail", AppUser.normalizeEmail(r.adminEmail())));
            }
            return new Result(clinicId, admin.getId());
        }));
    }

    private void insertSubscription(UUID clinicId, PlanCatalog.Plan plan, Request r, Set<AppModule> modules,
                                    BigDecimal price, Integer maxUsers, AuthUser actor) {
        Instant now = Instant.now();
        String modulesArray = PlanCatalog.pgArray(modules);
        if ("INTERNAL".equals(plan.code())) {
            // Sin cobro ni vencimiento.
            db.update("""
                    insert into clinic_subscription (clinic_id, plan_code, status, billing_cycle, price, max_users, modules)
                    values (?, ?, 'ACTIVE', ?, 0, ?, ?::varchar[])""",
                    clinicId, plan.code(), r.cycle().name(), maxUsers, modulesArray);
            return;
        }
        if (r.trialDays() != null && r.trialDays() > 0) {
            db.update("""
                    insert into clinic_subscription (clinic_id, plan_code, status, billing_cycle, price, max_users, modules, trial_ends_at)
                    values (?, ?, 'TRIAL', ?, ?, ?, ?::varchar[], ?)""",
                    clinicId, plan.code(), r.cycle().name(), price, maxUsers, modulesArray,
                    java.sql.Timestamp.from(now.plus(Duration.ofDays(r.trialDays()))));
            return;
        }
        if (r.paymentReference() == null || r.paymentReference().isBlank()) {
            throw new BadRequestException("Sin periodo de prueba, indica la referencia del primer pago recibido.");
        }
        Instant end = r.cycle().endOfPeriodStarting(now);
        db.update("""
                insert into clinic_subscription (clinic_id, plan_code, status, billing_cycle, price, max_users, modules,
                                                 current_period_start, current_period_end)
                values (?, ?, 'ACTIVE', ?, ?, ?, ?::varchar[], ?, ?)""",
                clinicId, plan.code(), r.cycle().name(), price, maxUsers, modulesArray,
                java.sql.Timestamp.from(now), java.sql.Timestamp.from(end));
        db.update("""
                insert into subscription_charge (id, clinic_id, period_start, period_end, amount, status, method,
                                                 attempts, reference, paid_at, created_by)
                values (?, ?, ?, ?, ?, 'PAID', 'MANUAL', 0, ?, now(), ?)""",
                UUID.randomUUID(), clinicId, java.sql.Timestamp.from(now), java.sql.Timestamp.from(end), price,
                r.paymentReference().trim(), actor == null ? null : actor.userId());
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
