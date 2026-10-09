package lat.occlus.platform;

import static lat.occlus.platform.SubscriptionBilling.ts;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import lat.occlus.platform.HostedCheckout.CheckoutRequest;
import lat.occlus.platform.HostedCheckout.Payment;
import lat.occlus.platform.HostedCheckout.Status;
import lat.occlus.platform.HostedCheckout.WebhookEvent;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.tenant.TenantContext;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.ConflictException;
import lat.occlus.shared.web.NotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClientException;

/**
 * Pago de la suscripción por la propia clínica en la página de la pasarela.
 *
 * <p>Principio: <b>nada se da por pagado por lo que diga el navegador o el cuerpo de un webhook</b>.
 * Siempre se consulta la transacción a la pasarela y se cruzan referencia, monto y moneda con lo que
 * nosotros registramos. Lo que no cuadra no se aplica y se avisa al equipo.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CheckoutService {

    private static final Pattern ENGINE_REFERENCE = Pattern.compile("^sub-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-\\d+$");
    /** Mientras hay un pago en curso, el cobro automático espera: así no se cobra dos veces. */
    private static final Duration HOLD = Duration.ofMinutes(30);

    public record Started(UUID checkoutId, String provider, String redirectUrl, Map<String, String> params) {}

    public record Result(String status, String message) {}

    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    private final SubscriptionBilling billing;
    private final PaymentGateways gateways;
    private final PaymentProperties props;
    private final PlatformEvents events;

    // ---------- Iniciar ----------

    public Started start(AuthUser me, String provider) {
        var gateway = gateways.hosted(provider)
                .orElseThrow(() -> new BadRequestException("Esa forma de pago no está disponible."));
        return TenantContext.callAsSystem(() -> tx.execute(status -> {
            Subscription sub = billing.lock(me.clinicId());
            if ("INTERNAL".equals(sub.planCode())) throw new ConflictException("Esta cuenta no se cobra.");
            if (sub.status() == SubscriptionStatus.CANCELLED) {
                throw new ConflictException("La suscripción está cancelada. Comunícate con Occlus para retomarla.");
            }
            if (sub.price().signum() <= 0) throw new ConflictException("Esta cuenta no tiene un valor para cobrar.");
            Instant now = Instant.now();
            UUID chargeId = billing.openOrAdvanceCharge(me.clinicId(), sub, me.userId(), now);
            BigDecimal amount = db.queryForObject("select amount from subscription_charge where id = ?", BigDecimal.class, chargeId);
            if (amount.signum() <= 0) throw new ConflictException("El cobro no tiene valor.");
            db.update("""
                    update subscription_charge set next_attempt_at = ?
                    where id = ? and status = 'PENDING' and (next_attempt_at is null or next_attempt_at < ?)""",
                    ts(now.plus(HOLD)), chargeId, ts(now.plus(HOLD)));

            UUID id = UUID.randomUUID();
            String reference = "occ-" + id;
            db.update("""
                    insert into subscription_checkout (id, clinic_id, charge_id, provider, reference, amount, created_by)
                    values (?, ?, ?, ?, ?, ?, ?)""", id, me.clinicId(), chargeId, gateway.provider(), reference, amount, me.userId());
            String email = db.queryForObject("select email from app_user where id = ?", String.class, me.userId());
            var session = gateway.start(new CheckoutRequest(reference, amount, "COP", "Suscripción Occlus " + sub.planName(), email,
                    props.publicUrl() + "/pago?c=" + id, props.publicUrl() + "/api/webhooks/" + gateway.provider().toLowerCase(), id.toString()));
            return new Started(id, gateway.provider(), session.redirectUrl(), session.params());
        }));
    }

    // ---------- Confirmar desde el navegador ----------

    /** La persona volvió de la pasarela (o recarga la página): se pregunta a la pasarela cómo quedó. */
    public Result refresh(AuthUser me, UUID id, String providerRef) {
        var rows = TenantContext.callAsSystem(() -> db.queryForList(
                "select * from subscription_checkout where id = ? and clinic_id = ?", id, me.clinicId()));
        if (rows.isEmpty()) throw new NotFoundException("Pago no encontrado");
        var checkout = rows.getFirst();
        Result known = known((String) checkout.get("status"));
        if (known != null) return known;

        var gateway = gateways.hostedAnyState((String) checkout.get("provider")).orElseThrow();
        Payment payment;
        try {
            String ref = providerRef != null && !providerRef.isBlank() ? providerRef.trim() : (String) checkout.get("provider_ref");
            payment = ref != null ? gateway.fetch(ref) : gateway.findByReference((String) checkout.get("reference")).orElse(null);
        } catch (RestClientException | HostedCheckout.InvalidSignatureException e) {
            log.warn("No se pudo consultar a {}: {}", gateway.provider(), e.getClass().getSimpleName());
            return new Result("CREATED", "No pudimos consultar el estado del pago todavía. Se confirmará solo en unos minutos.");
        }
        if (payment == null) return new Result("CREATED", "Aún no recibimos el resultado del pago.");
        return apply(checkout, payment);
    }

    // ---------- Webhooks ----------

    /** Evento con firma ya verificada. Aun así, el estado real se consulta a la pasarela. */
    public void onWebhook(HostedCheckout gateway, WebhookEvent event) {
        String reference = event.reference();
        if (reference.startsWith("occ-")) {
            var rows = TenantContext.callAsSystem(() -> db.queryForList("select * from subscription_checkout where reference = ?", reference));
            if (rows.isEmpty() || !gateway.provider().equals(rows.getFirst().get("provider"))) return;
            apply(rows.getFirst(), gateway.fetch(event.providerRef()));
            return;
        }
        // Cobros automáticos que quedaron pendientes en la pasarela: su aprobación llega después.
        var m = ENGINE_REFERENCE.matcher(reference);
        if (!m.matches()) return;
        UUID chargeId = UUID.fromString(m.group(1));
        var rows = TenantContext.callAsSystem(() -> db.queryForList(
                "select clinic_id, amount from subscription_charge where id = ?", chargeId));
        if (rows.isEmpty()) return;
        Payment p = gateway.fetch(event.providerRef());
        UUID clinicId = (UUID) rows.getFirst().get("clinic_id");
        BigDecimal amount = (BigDecimal) rows.getFirst().get("amount");
        if (!matches(p, reference, amount)) {
            review(clinicId, "Un pago automático no coincide con su cobro", p, "mismatch:" + p.providerRef());
            return;
        }
        if (p.status() == Status.APPROVED) TenantContext.callAsSystem(() -> tx.execute(st -> settle(clinicId, chargeId, p.providerRef())));
    }

    // ---------- Aplicar el resultado ----------

    private Result apply(Map<String, Object> checkout, Payment p) {
        UUID id = (UUID) checkout.get("id");
        UUID clinicId = (UUID) checkout.get("clinic_id");
        UUID chargeId = (UUID) checkout.get("charge_id");
        Result known = known((String) checkout.get("status"));
        if (known != null) return known;
        if (!matches(p, (String) checkout.get("reference"), (BigDecimal) checkout.get("amount"))) {
            log.warn("Pago con datos que no coinciden (checkout {})", id);
            review(clinicId, "Un pago no coincide con su cobro", p, "mismatch:" + p.providerRef());
            return new Result("CREATED", "El pago no coincide con el cobro. El equipo de Occlus lo revisará.");
        }
        return switch (p.status()) {
            case PENDING -> new Result("CREATED", "Tu pago está en proceso. Se confirmará en unos minutos.");
            case DECLINED -> TenantContext.callAsSystem(() -> tx.execute(st -> {
                int n = db.update("""
                        update subscription_checkout set status = 'DECLINED', provider_ref = ?, failure_reason = ?, updated_at = now()
                        where id = ? and status = 'CREATED'""", p.providerRef(), trim(p.message(), 300), id);
                if (n == 1) {
                    // Que el cobro automático (si hay tarjeta guardada) pueda volver a intentarlo.
                    db.update("update subscription_charge set next_attempt_at = ? where id = ? and status = 'PENDING' and next_attempt_at > ?",
                            ts(Instant.now()), chargeId, ts(Instant.now()));
                    events.emit("PAYMENT_FAILED", Severity.WARNING, clinicId, "Un pago por la pasarela fue rechazado: " + clinicName(clinicId),
                            Map.of("provider", (String) checkout.get("provider"), "reason", trim(p.message(), 200)),
                            "checkout-declined:" + id, true);
                }
                return new Result("DECLINED", "El pago fue rechazado. Puedes intentarlo de nuevo con otro medio de pago.");
            }));
            case APPROVED -> TenantContext.callAsSystem(() -> tx.execute(st -> {
                int n = db.update("""
                        update subscription_checkout set status = 'APPROVED', provider_ref = ?, updated_at = now()
                        where id = ? and status = 'CREATED'""", p.providerRef(), id);
                if (n == 1) settle(clinicId, chargeId, p.providerRef());
                return new Result("APPROVED", "¡Pago recibido! Tu suscripción está al día.");
            }));
        };
    }

    /** Dentro de una transacción. Si el cobro ya estaba pagado u anulado, no se aplica y se avisa al equipo. */
    private Object settle(UUID clinicId, UUID chargeId, String providerRef) {
        billing.lock(clinicId);
        var charge = db.queryForMap("select status, provider_ref, amount from subscription_charge where id = ?", chargeId);
        String status = (String) charge.get("status");
        if (status.equals("PAID") && providerRef.equals(charge.get("provider_ref"))) return null; // ya aplicado
        if (status.equals("PAID") || status.equals("VOID")) {
            // Se cobró dinero real a un cobro que ya no admite pago: hay que reembolsar o aplicarlo a mano.
            review(clinicId, status.equals("PAID") ? "Pago duplicado" : "Pago sobre un cobro anulado",
                    new Payment(Status.APPROVED, providerRef, "", (BigDecimal) charge.get("amount"), "COP", ""), "review:" + providerRef);
            return null;
        }
        billing.settle(clinicId, chargeId, "GATEWAY", null, providerRef, null, Instant.now());
        return null;
    }

    /** Sirve dentro o fuera de una transacción (los eventos de plataforma solo se escriben en modo sistema). */
    private void review(UUID clinicId, String what, Payment p, String dedupeKey) {
        runAsSystem(() -> review0(clinicId, what, p, dedupeKey));
    }

    private static <T> T runAsSystem(java.util.function.Supplier<T> action) {
        return TransactionSynchronizationManager.isActualTransactionActive() ? action.get() : TenantContext.callAsSystem(action);
    }

    private Object review0(UUID clinicId, String what, Payment p, String dedupeKey) {
        return events.emit("PAYMENT_REVIEW", Severity.CRITICAL, clinicId, what + " (revisar con la pasarela): " + clinicName(clinicId),
                Map.of("providerRef", String.valueOf(p.providerRef()), "reference", String.valueOf(p.reference()),
                        "amount", p.amount().toPlainString(), "status", p.status().name()), dedupeKey, true);
    }

    private static boolean matches(Payment p, String reference, BigDecimal amount) {
        return reference.equals(p.reference()) && p.amount().compareTo(amount) == 0 && "COP".equalsIgnoreCase(p.currency());
    }

    private static Result known(String status) {
        return switch (status) {
            case "APPROVED" -> new Result("APPROVED", "¡Pago recibido! Tu suscripción está al día.");
            case "DECLINED" -> new Result("DECLINED", "El pago fue rechazado. Puedes intentarlo de nuevo con otro medio de pago.");
            default -> null;
        };
    }

    private String clinicName(UUID clinicId) {
        return db.queryForObject("select name from clinic where id = ?", String.class, clinicId);
    }

    private static String trim(String s, int max) {
        return s == null ? "" : s.length() > max ? s.substring(0, max) : s;
    }
}
