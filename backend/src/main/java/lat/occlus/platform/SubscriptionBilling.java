package lat.occlus.platform;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import lat.occlus.shared.web.ConflictException;
import lat.occlus.shared.web.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Reglas compartidas de cobro: las usan el motor automático y el registro manual del administrador. */
@Component
@RequiredArgsConstructor
public class SubscriptionBilling {

    private final JdbcTemplate db;
    private final Entitlements entitlements;
    private final PlatformEvents events;

    static Timestamp ts(Instant t) {
        return Timestamp.from(t.truncatedTo(ChronoUnit.MICROS));
    }

    /** Bloquea la fila de suscripción hasta el fin de la transacción. */
    @Transactional(propagation = Propagation.MANDATORY)
    public Subscription lock(UUID clinicId) {
        return db.query("""
                select cs.*, sp.name as plan_name from clinic_subscription cs
                join subscription_plan sp on sp.code = cs.plan_code
                where cs.clinic_id = ? for update of cs""", Entitlements::map, clinicId).stream().findFirst()
                .orElseThrow(() -> new NotFoundException("Cliente no encontrado"));
    }

    /**
     * Crea el cobro PENDING del periodo que empieza en {@code start}. Si ya existe uno para ese
     * periodo (el proceso corrió dos veces), devuelve el existente: nunca hay dos cobros por periodo.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public UUID createCharge(UUID clinicId, Instant start, BillingCycle cycle, BigDecimal amount, Instant now, UUID actor) {
        db.update("""
                insert into subscription_charge (id, clinic_id, period_start, period_end, amount, status, next_attempt_at, created_by)
                values (?, ?, ?, ?, ?, 'PENDING', ?, ?) on conflict (clinic_id, period_start) do nothing""",
                UUID.randomUUID(), clinicId, ts(start), ts(cycle.endOfPeriodStarting(start)), amount, ts(now), actor);
        return db.queryForObject("select id from subscription_charge where clinic_id = ? and period_start = ?",
                UUID.class, clinicId, ts(start));
    }

    /**
     * Marca un cobro como pagado y deja la suscripción activa. Idempotente: pagar dos veces el
     * mismo cobro no extiende el periodo dos veces.
     *
     * <p>Si la clínica ya estaba suspendida (pasó la gracia) el periodo nuevo empieza hoy, no en
     * la fecha original: no se cobra ni se regala tiempo que la clínica no pudo usar.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void settle(UUID clinicId, UUID chargeId, String method, String reference, String providerRef,
                       UUID actor, Instant now) {
        Subscription sub = lock(clinicId);
        Map<String, Object> charge = db.queryForList(
                "select * from subscription_charge where id = ? and clinic_id = ? for update", chargeId, clinicId)
                .stream().findFirst().orElseThrow(() -> new NotFoundException("Cobro no encontrado"));
        String status = (String) charge.get("status");
        if (status.equals("PAID")) return;
        if (status.equals("VOID")) throw new ConflictException("Ese cobro fue anulado.");

        Instant start = ((Timestamp) charge.get("period_start")).toInstant();
        Instant end = ((Timestamp) charge.get("period_end")).toInstant();
        boolean lapsed = sub.status() == SubscriptionStatus.SUSPENDED || sub.status() == SubscriptionStatus.CANCELLED
                || (sub.status() == SubscriptionStatus.PAST_DUE && !now.isBefore(sub.pastDueSince().plus(entitlements.grace())));
        if (lapsed) {
            start = now;
            end = sub.billingCycle().endOfPeriodStarting(now);
        }
        db.update("""
                update subscription_charge set status = 'PAID', method = ?, reference = ?, provider_ref = ?, paid_at = ?,
                       failure_reason = null, next_attempt_at = null, period_start = ?, period_end = ? where id = ?""",
                method, reference, providerRef, ts(now), ts(start), ts(end), chargeId);

        boolean advances = sub.currentPeriodEnd() == null || end.isAfter(sub.currentPeriodEnd());
        if (advances) {
            // Pago adelantado de un periodo contiguo: se amplía el final sin mover el inicio.
            boolean contiguous = sub.status() == SubscriptionStatus.ACTIVE && sub.currentPeriodEnd() != null
                    && !start.isAfter(sub.currentPeriodEnd());
            Instant periodStart = contiguous ? sub.currentPeriodStart() : start;
            db.update("""
                    update clinic_subscription set status = 'ACTIVE', current_period_start = ?, current_period_end = ?,
                           past_due_since = null, suspended_at = null, cancelled_at = null, updated_at = now()
                    where clinic_id = ?""", ts(periodStart), ts(end), clinicId);
        }
        BigDecimal amount = (BigDecimal) charge.get("amount");
        events.emit("PAYMENT_RECEIVED", Severity.INFO, clinicId, "Pago recibido de " + clinicName(clinicId),
                Map.of("amount", amount.toPlainString(), "method", method, "periodEnd", end.toString()), null, false);
    }

    private String clinicName(UUID clinicId) {
        return db.queryForObject("select name from clinic where id = ?", String.class, clinicId);
    }
}
