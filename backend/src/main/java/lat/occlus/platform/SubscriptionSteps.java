package lat.occlus.platform;

import static lat.occlus.platform.SubscriptionBilling.ts;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Pasos del ciclo de vida de una suscripción, cada uno en su propia transacción. Los invoca
 * {@link SubscriptionEngine}; están separados para que cada transacción sea corta y para que la
 * llamada a la pasarela (red) ocurra SIN transacción ni candado abiertos.
 */
@Service
@RequiredArgsConstructor
public class SubscriptionSteps {

    static final int MAX_ATTEMPTS = 4;
    private static final Duration LEASE = Duration.ofMinutes(10);
    private static final Duration TRIAL_WARNING = Duration.ofDays(3);
    private static final Duration RENEWAL_WARNING = Duration.ofDays(7);
    private static final DateTimeFormatter DATE =
            DateTimeFormatter.ofPattern("d 'de' MMM 'de' yyyy", Locale.forLanguageTag("es-CO")).withZone(ZoneId.of("America/Bogota"));

    public record Ticket(BigDecimal amount, String tokenRef, int attempt, String provider, String customerEmail) {}

    private final JdbcTemplate db;
    private final Entitlements entitlements;
    private final SubscriptionBilling billing;
    private final PlatformEvents events;

    /** Clínicas que podrían necesitar acción: pruebas y renovaciones cercanas, y todas las que están en mora. */
    @Transactional(readOnly = true)
    public List<UUID> candidates(Instant now) {
        Instant horizon = now.plus(RENEWAL_WARNING);
        return db.queryForList("""
                select clinic_id from clinic_subscription
                where status in ('TRIAL', 'ACTIVE', 'PAST_DUE')
                  and ((status = 'TRIAL' and trial_ends_at <= ?)
                    or (status = 'ACTIVE' and current_period_end is not null and current_period_end <= ?)
                    or status = 'PAST_DUE')""", UUID.class, ts(horizon), ts(horizon));
    }

    /**
     * Avanza la suscripción según las fechas (fin de prueba, renovación, fin de la gracia) y
     * devuelve los cobros que ya toca intentar con la pasarela. Idempotente: si corre dos veces
     * no duplica cobros ni avisos. {@code skip locked} evita que dos instancias la procesen a la vez.
     */
    @Transactional
    public List<UUID> advance(UUID clinicId, Instant now) {
        Optional<Subscription> locked = db.query("""
                select cs.*, sp.name as plan_name from clinic_subscription cs
                join subscription_plan sp on sp.code = cs.plan_code
                where cs.clinic_id = ? for update of cs skip locked""", Entitlements::map, clinicId).stream().findFirst();
        if (locked.isEmpty()) return List.of();
        Subscription sub = locked.get();
        String name = db.queryForObject("select name from clinic where id = ?", String.class, clinicId);
        boolean hasMethod = Boolean.TRUE.equals(db.queryForObject(
                "select exists(select 1 from subscription_payment_method where clinic_id = ?)", Boolean.class, clinicId));

        switch (sub.status()) {
            case TRIAL -> {
                Instant end = sub.trialEndsAt();
                if (now.isBefore(end)) {
                    if (end.minus(TRIAL_WARNING).isBefore(now)) {
                        events.emit("TRIAL_ENDING", Severity.WARNING, clinicId,
                                "La prueba de %s termina el %s".formatted(name, DATE.format(end)),
                                Map.of("trialEndsAt", end.toString()), "trial-ending:" + end, true);
                    }
                } else if (sub.cancelAtPeriodEnd()) {
                    cancel(sub, name, now);
                } else {
                    startBilling(sub, name, end, now, hasMethod, "TRIAL_ENDED",
                            "La prueba de %s terminó".formatted(name));
                }
            }
            case ACTIVE -> {
                Instant end = sub.currentPeriodEnd();
                if (end == null) break; // cuenta sin vencimiento
                if (now.isBefore(end)) {
                    if (end.minus(RENEWAL_WARNING).isBefore(now)) {
                        // Con tarjeta registrada el cobro es automático; sin ella hay que cobrar a mano: avisar.
                        events.emit("RENEWAL_UPCOMING", Severity.INFO, clinicId,
                                "%s renueva el %s".formatted(name, DATE.format(end)),
                                Map.of("periodEnd", end.toString(), "amount", sub.price().toPlainString()),
                                "renewal-upcoming:" + end, !hasMethod);
                    }
                } else if (sub.cancelAtPeriodEnd()) {
                    cancel(sub, name, now);
                } else {
                    startBilling(sub, name, end, now, hasMethod, "RENEWAL_DUE", "Renovación pendiente de " + name);
                }
            }
            case PAST_DUE -> {
                if (!now.isBefore(sub.pastDueSince().plus(entitlements.grace()))) suspend(sub, name, now);
            }
            default -> { }
        }
        return dueCharges(clinicId, now);
    }

    /** Crea el cobro del periodo que vence y pasa la suscripción a mora desde esa fecha. */
    private void startBilling(Subscription sub, String name, Instant due, Instant now, boolean hasMethod,
                              String kind, String title) {
        UUID chargeId = billing.createCharge(sub.clinicId(), due, sub.billingCycle(), sub.price(), now, null);
        if (sub.price().signum() == 0) {
            // Plan sin costo: se renueva solo, sin pasarela.
            billing.settle(sub.clinicId(), chargeId, "MANUAL", "Sin costo", null, null, now);
            return;
        }
        db.update("""
                update clinic_subscription set status = 'PAST_DUE', past_due_since = ?, updated_at = now()
                where clinic_id = ?""", ts(due), sub.clinicId());
        events.emit(kind, hasMethod ? Severity.INFO : Severity.WARNING, sub.clinicId(),
                title + (hasMethod ? ": se intentará el cobro automático" : ": hay que registrar el pago o se suspenderá"),
                Map.of("due", due.toString(), "amount", sub.price().toPlainString(), "automatic", hasMethod),
                kind.toLowerCase() + ":" + due, true);
    }

    private void suspend(Subscription sub, String name, Instant now) {
        db.update("""
                update clinic_subscription set status = 'SUSPENDED', suspended_at = ?, updated_at = now()
                where clinic_id = ?""", ts(now), sub.clinicId());
        events.emit("SUSPENDED", Severity.CRITICAL, sub.clinicId(),
                "%s fue suspendida por falta de pago".formatted(name),
                Map.of("pastDueSince", sub.pastDueSince().toString()), "suspended:" + sub.pastDueSince(), true);
    }

    private void cancel(Subscription sub, String name, Instant now) {
        db.update("""
                update clinic_subscription set status = 'CANCELLED', cancelled_at = ?, cancel_at_period_end = false,
                       updated_at = now() where clinic_id = ?""", ts(now), sub.clinicId());
        events.emit("SUBSCRIPTION_CANCELLED", Severity.WARNING, sub.clinicId(),
                "La suscripción de %s terminó por cancelación".formatted(name), Map.of(), "cancelled:" + now.toEpochMilli(), true);
    }

    private List<UUID> dueCharges(UUID clinicId, Instant now) {
        return db.queryForList("""
                select c.id from subscription_charge c
                join subscription_payment_method m on m.clinic_id = c.clinic_id
                join clinic_subscription s on s.clinic_id = c.clinic_id
                where c.clinic_id = ? and c.status = 'PENDING' and c.attempts < ? and c.next_attempt_at <= ?
                  and s.status = 'PAST_DUE' order by c.period_start""", UUID.class, clinicId, MAX_ATTEMPTS, ts(now));
    }

    /**
     * Paso 1 del cobro: reserva el intento (lo cuenta y deja un "arrendamiento" de 10 minutos para
     * que nadie más lo repita mientras se llama a la pasarela). null si ya no toca intentarlo.
     */
    @Transactional
    public Ticket begin(UUID clinicId, UUID chargeId, Instant now) {
        var rows = db.queryForList("""
                select c.amount, c.attempts, m.token_ref, m.provider,
                       (select u.email from app_user u where u.clinic_id = c.clinic_id and u.role = 'ADMIN' and u.active
                        order by u.created_at limit 1) as admin_email
                from subscription_charge c
                join subscription_payment_method m on m.clinic_id = c.clinic_id
                where c.id = ? and c.clinic_id = ? and c.status = 'PENDING' and c.attempts < ? and c.next_attempt_at <= ?
                for update of c skip locked""", chargeId, clinicId, MAX_ATTEMPTS, ts(now));
        if (rows.isEmpty()) return null;
        var row = rows.getFirst();
        int attempt = ((Number) row.get("attempts")).intValue() + 1;
        db.update("update subscription_charge set attempts = ?, next_attempt_at = ? where id = ?",
                attempt, ts(now.plus(LEASE)), chargeId);
        return new Ticket((BigDecimal) row.get("amount"), (String) row.get("token_ref"), attempt,
                (String) row.get("provider"), (String) row.get("admin_email"));
    }

    /** Paso 3: aplica el resultado de la pasarela. @return true si el cobro quedó pagado. */
    @Transactional
    public boolean finish(UUID clinicId, UUID chargeId, int attempt, PaymentGateway.ChargeResult result, Instant now) {
        if (result.approved()) {
            billing.settle(clinicId, chargeId, "GATEWAY", null, result.providerRef(), null, now);
            return true;
        }
        billing.lock(clinicId);
        if (result.pending()) {
            // La pasarela aún no decide: el webhook lo resolverá. Si no llega, se reintenta con el mismo espaciado.
            Duration wait = Duration.ofDays(attempt == 1 ? 1 : attempt == 2 ? 3 : 5);
            db.update("""
                    update subscription_charge set failure_reason = ?, next_attempt_at = ? where id = ? and status = 'PENDING'""",
                    result.failureReason(), ts(now.plus(wait)), chargeId);
            return false;
        }
        boolean exhausted = attempt >= MAX_ATTEMPTS;
        // Reintentos a 1, 3 y 5 días del intento anterior; agotados, queda FAILED (se puede pagar a mano).
        Duration backoff = Duration.ofDays(attempt == 1 ? 1 : attempt == 2 ? 3 : 5);
        String reason = result.failureReason() == null ? "Cobro no aprobado"
                : result.failureReason().substring(0, Math.min(300, result.failureReason().length()));
        db.update("""
                update subscription_charge set failure_reason = ?, status = ?, next_attempt_at = ?
                where id = ? and status = 'PENDING'""", reason, exhausted ? "FAILED" : "PENDING",
                exhausted ? null : ts(now.plus(backoff)), chargeId);
        String name = db.queryForObject("select name from clinic where id = ?", String.class, clinicId);
        events.emit("PAYMENT_FAILED", Severity.WARNING, clinicId,
                "Falló el cobro automático de %s (intento %d de %d)".formatted(name, attempt, MAX_ATTEMPTS),
                Map.of("reason", reason, "attempt", attempt, "willRetry", !exhausted), "fail:" + chargeId + ":" + attempt, true);
        return false;
    }
}
