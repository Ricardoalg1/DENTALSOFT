package lat.occlus.platform;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Cobro automático contra un medio de pago guardado (tarjeta tokenizada por la pasarela: nunca
 * se guardan datos de tarjeta). Un cobro NO se da por pagado sin evidencia verificable de la pasarela.
 */
public interface PaymentGateway {

    /** Nombre guardado en subscription_payment_method.provider (SIMULATED, WOMPI). */
    String provider();

    /** Solo las pasarelas activadas por configuración pueden cobrar. */
    boolean enabled();

    /** Debe ser idempotente respecto a {@code idempotencyKey}: repetir la llamada no cobra dos veces. */
    ChargeResult charge(ChargeRequest request);

    record ChargeRequest(UUID clinicId, UUID chargeId, BigDecimal amount, String currency, String tokenRef,
                         String idempotencyKey, String customerEmail) {}

    enum Outcome { APPROVED, DECLINED, PENDING }

    /** PENDING: la pasarela aún no decide; el resultado llega después por webhook. */
    record ChargeResult(Outcome outcome, String providerRef, String failureReason) {

        public static ChargeResult approved(String providerRef) {
            return new ChargeResult(Outcome.APPROVED, providerRef, null);
        }

        public static ChargeResult declined(String reason) {
            return new ChargeResult(Outcome.DECLINED, null, reason);
        }

        public static ChargeResult pending(String providerRef) {
            return new ChargeResult(Outcome.PENDING, providerRef, "Pendiente de confirmación de la pasarela");
        }

        public boolean approved() {
            return outcome == Outcome.APPROVED;
        }

        public boolean pending() {
            return outcome == Outcome.PENDING;
        }
    }
}
