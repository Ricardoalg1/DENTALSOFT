package lat.occlus.platform;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

/** Suscripción de una clínica tal como está guardada. */
public record Subscription(
        UUID clinicId, String planCode, String planName, SubscriptionStatus status, BillingCycle billingCycle,
        BigDecimal price, Integer maxUsers, Set<AppModule> modules, Instant trialEndsAt,
        Instant currentPeriodStart, Instant currentPeriodEnd, boolean cancelAtPeriodEnd,
        Instant pastDueSince, Instant suspendedAt, Instant cancelledAt) {

    /**
     * Resultado de evaluar si la clínica puede usar la aplicación en {@code now}.
     *
     * @param until   hasta cuándo funciona (null = sin límite o ya sin acceso)
     * @param inGrace ya venció el periodo, pero sigue funcionando dentro del periodo de gracia
     * @param reason  si no hay acceso: SUSPENDED, CANCELLED o EXPIRED
     */
    public record Access(boolean allowed, Instant until, boolean inGrace, String reason) {

        static Access open() {
            return new Access(true, null, false, null);
        }

        static Access denied(String reason) {
            return new Access(false, null, false, reason);
        }
    }

    /**
     * El acceso se calcula SIEMPRE a partir de las fechas guardadas: no depende de que el proceso
     * programado haya corrido. Si ese proceso está caído, una suscripción vencida igual deja de
     * funcionar cuando termina la gracia.
     */
    public Access access(Instant now, Duration grace) {
        return switch (status) {
            case SUSPENDED -> Access.denied("SUSPENDED");
            case CANCELLED -> Access.denied("CANCELLED");
            case TRIAL -> window(trialEndsAt, grace, now);
            case PAST_DUE -> window(pastDueSince, grace, now);
            // Sin fecha de vencimiento = cuenta interna o cortesía.
            case ACTIVE -> currentPeriodEnd == null ? Access.open()
                    // Si el cliente pidió cancelar, el servicio termina exactamente al final del periodo.
                    : window(currentPeriodEnd, cancelAtPeriodEnd ? Duration.ZERO : grace, now);
        };
    }

    private static Access window(Instant base, Duration grace, Instant now) {
        Instant until = base.plus(grace);
        if (!now.isBefore(until)) return Access.denied("EXPIRED");
        return new Access(true, until, !now.isBefore(base), null);
    }

    public boolean has(AppModule module) {
        return modules.contains(module);
    }
}
