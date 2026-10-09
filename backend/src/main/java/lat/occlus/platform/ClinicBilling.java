package lat.occlus.platform;

import java.time.Instant;
import java.util.List;
import lat.occlus.platform.ClinicBillingDtos.CardRequest;
import lat.occlus.platform.ClinicBillingDtos.State;
import lat.occlus.platform.PlatformDtos.PaymentMethodView;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.tenant.TenantContext;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.ConflictException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Lo que el administrador de una clínica ve y hace sobre SU suscripción: estado, pagar y guardar tarjeta. */
@Service
@RequiredArgsConstructor
public class ClinicBilling {

    private final JdbcTemplate db;
    private final Entitlements entitlements;
    private final SubscriptionAdmin subscriptions;
    private final PaymentGateways gateways;
    private final WompiGateway wompi;

    public State state(AuthUser me) {
        return TenantContext.callAsSystem(() -> {
            Subscription sub = entitlements.find(me.clinicId()).orElseThrow(() -> new ConflictException("Tu clínica no tiene suscripción."));
            var access = sub.access(Instant.now(), entitlements.grace());
            var open = db.queryForList("""
                    select period_start from subscription_charge where clinic_id = ? and status in ('PENDING', 'FAILED')
                    order by period_start limit 1""", java.sql.Timestamp.class, me.clinicId());
            Instant due = !open.isEmpty() ? open.getFirst().toInstant()
                    : sub.currentPeriodEnd() != null ? sub.currentPeriodEnd() : sub.trialEndsAt();
            List<String> providers = gateways.hostedProviders();
            String why = "INTERNAL".equals(sub.planCode()) ? "Esta cuenta no se cobra."
                    : sub.status() == SubscriptionStatus.CANCELLED ? "La suscripción está cancelada: comunícate con Occlus para retomarla."
                    : sub.price().signum() <= 0 ? "Esta cuenta no tiene un valor para cobrar."
                    : providers.isEmpty() ? "El pago en línea no está disponible: comunícate con Occlus." : null;
            var method = db.query("select provider, label from subscription_payment_method where clinic_id = ?",
                    (rs, i) -> new PaymentMethodView(rs.getString("provider"), rs.getString("label")), me.clinicId()).stream().findFirst().orElse(null);
            var charges = subscriptions.charges(me.clinicId()).stream().limit(12).toList();
            return new State(sub.planCode(), sub.planName(), sub.status().name(), sub.billingCycle().name(), sub.price(),
                    sub.trialEndsAt(), sub.currentPeriodEnd(), sub.cancelAtPeriodEnd(), access.allowed(),
                    access.allowed() ? null : Entitlements.inactiveMessage(access.reason()), due, why == null, why, providers,
                    wompi.enabled(), method, charges);
        });
    }

    public WompiGateway.Setup wompiSetup() {
        if (!wompi.enabled()) throw new BadRequestException("Esta forma de pago no está disponible.");
        return wompi.setup();
    }

    /** Convierte la tarjeta (tokenizada por el navegador) en una fuente de pago de Wompi y la deja para la renovación automática. */
    public void saveCard(AuthUser me, CardRequest req) {
        if (!wompi.enabled()) throw new BadRequestException("Esta forma de pago no está disponible.");
        String email = TenantContext.callAsSystem(() -> db.queryForObject("select email from app_user where id = ?", String.class, me.userId()));
        String sourceId;
        try {
            sourceId = wompi.createPaymentSource(req.cardToken(), email, req.acceptanceToken(), req.personalAuthToken());
        } catch (IllegalStateException e) {
            throw new BadRequestException("No pudimos guardar la tarjeta: " + e.getMessage());
        }
        TenantContext.callAsSystem(() -> db.update("""
                insert into subscription_payment_method (clinic_id, provider, token_ref, label, created_by)
                values (?, 'WOMPI', ?, ?, ?)
                on conflict (clinic_id) do update set provider = excluded.provider, token_ref = excluded.token_ref,
                    label = excluded.label, created_by = excluded.created_by, created_at = now()""",
                me.clinicId(), sourceId, req.label().trim(), me.userId()));
    }

    public void removeCard(AuthUser me) {
        TenantContext.callAsSystem(() -> db.update("delete from subscription_payment_method where clinic_id = ?", me.clinicId()));
    }
}
