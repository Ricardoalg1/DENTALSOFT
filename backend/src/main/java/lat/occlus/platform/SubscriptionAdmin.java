package lat.occlus.platform;

import static lat.occlus.platform.SubscriptionBilling.ts;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import lat.occlus.platform.PlatformDtos.ChargeView;
import lat.occlus.platform.PlatformDtos.PlanChange;
import lat.occlus.platform.PlatformDtos.SubscriptionView;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.ConflictException;
import lat.occlus.shared.web.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Acciones del administrador sobre la suscripción de un cliente. Todas bloquean la fila de
 * suscripción (no chocan con el proceso automático), validan el estado de partida y dejan su
 * registro de auditoría en la misma transacción.
 */
@Service
@RequiredArgsConstructor
public class SubscriptionAdmin {

    private final JdbcTemplate db;
    private final Entitlements entitlements;
    private final SubscriptionBilling billing;
    private final PlanCatalog plans;
    private final PlatformAudit audit;
    private final PlatformGate gate;
    private final PaymentGateway gateway;

    @Transactional
    public SubscriptionView changePlan(AuthUser me, UUID id, PlanChange req) {
        Subscription sub = billing.lock(id);
        var plan = plans.require(req.planCode());
        if ("INTERNAL".equals(plan.code()) != "INTERNAL".equals(sub.planCode())) {
            throw new ConflictException("El plan «Interno / cortesía» solo se asigna al crear el cliente: "
                    + "no se puede pasar de o hacia ese plan. Crea un cliente nuevo.");
        }
        if (!plan.active() && !plan.code().equals(sub.planCode())) throw new BadRequestException("Ese plan ya no se ofrece.");
        BigDecimal price = req.price() != null ? req.price() : plan.priceFor(req.billingCycle());
        if (price == null) throw new BadRequestException("El plan «%s» se cotiza: indica el precio pactado.".formatted(plan.name()));
        Integer maxUsers = req.maxUsers() != null ? req.maxUsers() : plan.maxUsers();
        var modules = req.reset() ? plan.modules() : sub.modules();
        if (maxUsers != null) {
            long active = db.queryForObject("select count(*) from app_user where clinic_id = ? and active", Long.class, id);
            if (active > maxUsers) {
                throw new ConflictException(("El cliente tiene %d usuarios activos y el nuevo plan permite %d. "
                        + "Debe desactivar usuarios antes del cambio.").formatted(active, maxUsers));
            }
        }
        db.update("""
                update clinic_subscription set plan_code = ?, billing_cycle = ?, price = ?, max_users = ?,
                       modules = ?::varchar[], updated_at = now() where clinic_id = ?""",
                plan.code(), req.billingCycle().name(), price, maxUsers, PlanCatalog.pgArray(modules), id);
        audit.record(me, "PLAN_CHANGED", id, "Cambió el plan a " + plan.name(),
                Views.details("from", Views.details("plan", sub.planCode(), "cycle", sub.billingCycle().name(),
                                "price", sub.price().toPlainString(), "maxUsers", sub.maxUsers()),
                        "to", Views.details("plan", plan.code(), "cycle", req.billingCycle().name(),
                                "price", price.toPlainString(), "maxUsers", maxUsers),
                        "modulesReset", req.reset(), "appliesFrom", "próxima renovación"));
        return view(id);
    }

    /** Alarga una prueba en curso, o reabre una que acaba de vencer sin que se hubiera cobrado nada. */
    @Transactional
    public SubscriptionView extendTrial(AuthUser me, UUID id, int days, String reason) {
        Subscription sub = billing.lock(id);
        boolean lapsedTrial = sub.currentPeriodEnd() == null && sub.trialEndsAt() != null
                && (sub.status() == SubscriptionStatus.PAST_DUE || sub.status() == SubscriptionStatus.SUSPENDED);
        if (sub.status() != SubscriptionStatus.TRIAL && !lapsedTrial) {
            throw new ConflictException("Solo se puede extender una prueba (o una prueba que venció sin pago).");
        }
        Instant now = Instant.now();
        Instant base = sub.trialEndsAt().isAfter(now) ? sub.trialEndsAt() : now;
        Instant newEnd = base.plus(Duration.ofDays(days));
        db.update("""
                update clinic_subscription set status = 'TRIAL', trial_ends_at = ?, past_due_since = null, suspended_at = null,
                       updated_at = now() where clinic_id = ?""", ts(newEnd), id);
        // El cobro del primer periodo todavía no corresponde: la prueba se alargó.
        int voided = voidPending(id);
        audit.record(me, "TRIAL_EXTENDED", id, "Extendió la prueba %d días".formatted(days),
                Views.details("days", days, "from", sub.trialEndsAt().toString(), "to", newEnd.toString(),
                        "voidedCharges", voided, "reason", reason));
        return view(id);
    }

    @Transactional
    public SubscriptionView suspend(AuthUser me, UUID id, String reason) {
        Subscription sub = billing.lock(id);
        protectPlatformAccounts(id);
        if (sub.status() == SubscriptionStatus.SUSPENDED || sub.status() == SubscriptionStatus.CANCELLED) {
            throw new ConflictException("La suscripción ya está " + (sub.status() == SubscriptionStatus.SUSPENDED ? "suspendida." : "cancelada."));
        }
        db.update("update clinic_subscription set status = 'SUSPENDED', suspended_at = now(), updated_at = now() where clinic_id = ?", id);
        audit.record(me, "SUSPENDED", id, "Suspendió al cliente", Views.details("reason", reason, "previousStatus", sub.status().name()));
        return view(id);
    }

    /**
     * Devuelve el acceso por cortesía durante unos días. Anula los cobros pendientes de la mora:
     * es una decisión del administrador, y evita que el proceso automático los cobre después.
     * (Para reactivar porque el cliente pagó, se registra el pago: eso reactiva solo.)
     */
    @Transactional
    public SubscriptionView reactivate(AuthUser me, UUID id, int courtesyDays, String reason) {
        Subscription sub = billing.lock(id);
        if (sub.status() != SubscriptionStatus.SUSPENDED && sub.status() != SubscriptionStatus.CANCELLED
                && sub.status() != SubscriptionStatus.PAST_DUE) {
            throw new ConflictException("Solo se reactivan suscripciones suspendidas, canceladas o en mora.");
        }
        Instant now = Instant.now();
        Instant end = now.plus(Duration.ofDays(courtesyDays));
        db.update("""
                update clinic_subscription set status = 'ACTIVE', current_period_start = ?, current_period_end = ?,
                       past_due_since = null, suspended_at = null, cancelled_at = null, cancel_at_period_end = false,
                       updated_at = now() where clinic_id = ?""", ts(now), ts(end), id);
        int voided = voidPending(id);
        audit.record(me, "REACTIVATED", id, "Reactivó al cliente por %d días".formatted(courtesyDays),
                Views.details("courtesyDays", courtesyDays, "until", end.toString(), "voidedCharges", voided,
                        "previousStatus", sub.status().name(), "reason", reason));
        return view(id);
    }

    @Transactional
    public SubscriptionView cancel(AuthUser me, UUID id, boolean immediately, String reason) {
        Subscription sub = billing.lock(id);
        if (sub.status() == SubscriptionStatus.CANCELLED) throw new ConflictException("La suscripción ya está cancelada.");
        protectPlatformAccounts(id);
        if (immediately) {
            db.update("""
                    update clinic_subscription set status = 'CANCELLED', cancelled_at = now(), cancel_at_period_end = false,
                           updated_at = now() where clinic_id = ?""", id);
        } else {
            boolean hasEnd = sub.status() == SubscriptionStatus.TRIAL || sub.currentPeriodEnd() != null;
            if (!hasEnd) throw new ConflictException("Esta cuenta no tiene un periodo que terminar: cancélala de inmediato.");
            db.update("update clinic_subscription set cancel_at_period_end = true, updated_at = now() where clinic_id = ?", id);
        }
        audit.record(me, immediately ? "CANCELLED" : "CANCEL_SCHEDULED",
                id, immediately ? "Canceló la suscripción" : "Programó la cancelación al final del periodo",
                Views.details("reason", reason, "previousStatus", sub.status().name()));
        return view(id);
    }

    /** Deshace una cancelación programada (todavía no se ejecutó). */
    @Transactional
    public SubscriptionView resume(AuthUser me, UUID id) {
        Subscription sub = billing.lock(id);
        if (!sub.cancelAtPeriodEnd()) throw new ConflictException("La suscripción no tiene una cancelación programada.");
        db.update("update clinic_subscription set cancel_at_period_end = false, updated_at = now() where clinic_id = ?", id);
        audit.record(me, "CANCEL_UNDONE", id, "Deshizo la cancelación programada", Views.details());
        return view(id);
    }

    // ---------- Cobro automático y pagos ----------

    @Transactional
    public void setPaymentMethod(AuthUser me, UUID id, String tokenRef, String label) {
        billing.lock(id);
        db.update("""
                insert into subscription_payment_method (clinic_id, provider, token_ref, label, created_by)
                values (?, ?, ?, ?, ?)
                on conflict (clinic_id) do update set provider = excluded.provider, token_ref = excluded.token_ref,
                    label = excluded.label, created_by = excluded.created_by, created_at = now()""",
                id, gateway.provider(), tokenRef.trim(), label.trim(), me.userId());
        // El token es sensible: la auditoría guarda solo la etiqueta.
        audit.record(me, "PAYMENT_METHOD_SET", id, "Registró un medio de pago para el cobro automático",
                Views.details("provider", gateway.provider(), "label", label.trim()));
    }

    @Transactional
    public void removePaymentMethod(AuthUser me, UUID id) {
        billing.lock(id);
        if (db.update("delete from subscription_payment_method where clinic_id = ?", id) == 0) {
            throw new NotFoundException("El cliente no tiene un medio de pago registrado.");
        }
        audit.record(me, "PAYMENT_METHOD_REMOVED", id, "Quitó el medio de pago del cobro automático", Views.details());
    }

    @Transactional(readOnly = true)
    public List<ChargeView> charges(UUID id) {
        return db.query("select * from subscription_charge where clinic_id = ? order by period_start desc limit 60", (rs, i) ->
                new ChargeView(rs.getObject("id", UUID.class), instant(rs.getTimestamp("period_start")),
                        instant(rs.getTimestamp("period_end")), rs.getBigDecimal("amount"), rs.getString("status"),
                        rs.getString("method"), rs.getInt("attempts"), instant(rs.getTimestamp("next_attempt_at")),
                        rs.getString("reference"), rs.getString("failure_reason"), instant(rs.getTimestamp("paid_at")),
                        instant(rs.getTimestamp("created_at"))), id);
    }

    /**
     * Registra un pago recibido fuera de la pasarela (transferencia, consignación). Salda el cobro
     * indicado, o el más antiguo pendiente; si no hay ninguno, crea y salda el del próximo periodo
     * (cliente que paga por adelantado). Reactiva al cliente si estaba en mora o suspendido.
     */
    @Transactional
    public ChargeView manualPayment(AuthUser me, UUID id, String reference, UUID chargeId) {
        Subscription sub = billing.lock(id);
        if ("INTERNAL".equals(sub.planCode())) throw new ConflictException("Esta cuenta no se cobra.");
        if (sub.status() == SubscriptionStatus.CANCELLED) {
            throw new ConflictException("La suscripción está cancelada: reactívala antes de registrar un pago.");
        }
        Instant now = Instant.now();
        // Un doble clic o un reenvío no debe pagar dos periodos: cada referencia vale una sola vez por cliente.
        if (db.queryForObject("select exists(select 1 from subscription_charge where clinic_id = ? and status = 'PAID' and lower(reference) = lower(?))",
                Boolean.class, id, reference.trim())) {
            throw new ConflictException("Ya hay un pago registrado con la referencia «%s» para este cliente.".formatted(reference.trim()));
        }
        UUID target;
        if (chargeId != null) {
            var row = db.queryForList("select status from subscription_charge where id = ? and clinic_id = ?", chargeId, id);
            if (row.isEmpty()) throw new NotFoundException("Cobro no encontrado");
            String status = (String) row.getFirst().get("status");
            if (!status.equals("PENDING") && !status.equals("FAILED")) throw new ConflictException("Ese cobro ya está " + (status.equals("PAID") ? "pagado." : "anulado."));
            target = chargeId;
        } else {
            var open = db.queryForList("select id from subscription_charge where clinic_id = ? and status in ('PENDING', 'FAILED') order by period_start limit 1", UUID.class, id);
            if (!open.isEmpty()) {
                target = open.getFirst();
            } else {
                Instant start = sub.currentPeriodEnd() != null ? sub.currentPeriodEnd()
                        : sub.trialEndsAt() != null ? sub.trialEndsAt() : now;
                target = billing.createCharge(id, start, sub.billingCycle(), sub.price(), now, me.userId());
            }
        }
        billing.settle(id, target, "MANUAL", reference.trim(), null, me.userId(), now);
        var charge = charges(id).stream().filter(c -> c.id().equals(target)).findFirst().orElseThrow();
        audit.record(me, "PAYMENT_REGISTERED", id, "Registró un pago manual de " + charge.amount().toPlainString(),
                Views.details("chargeId", target.toString(), "reference", reference.trim(), "amount", charge.amount().toPlainString(),
                        "periodEnd", charge.periodEnd().toString()));
        return charge;
    }

    // ---------- Apoyo ----------

    private SubscriptionView view(UUID id) {
        return Views.subscription(entitlements.find(id).orElseThrow(), entitlements.grace());
    }

    private int voidPending(UUID id) {
        return db.update("update subscription_charge set status = 'VOID', next_attempt_at = null where clinic_id = ? and status in ('PENDING', 'FAILED')", id);
    }

    /** Las cuentas del equipo de plataforma no se suspenden ni cancelan desde el panel: perderías el acceso al panel. */
    private void protectPlatformAccounts(UUID clinicId) {
        var ids = gate.platformAdminIds();
        if (ids.isEmpty()) return;
        String array = "{" + String.join(",", ids.stream().map(UUID::toString).toList()) + "}";
        boolean has = Boolean.TRUE.equals(db.queryForObject(
                "select exists(select 1 from app_user where clinic_id = ? and id = any(?::uuid[]))", Boolean.class, clinicId, array));
        if (has) {
            throw new ConflictException("Esta cuenta contiene usuarios del equipo de plataforma: no se puede suspender ni cancelar desde el panel.");
        }
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }
}
