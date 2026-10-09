package lat.occlus.platform;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Pasarela de cobro para las suscripciones. Hoy solo existe {@link SimulatedPaymentGateway}, que
 * NO mueve dinero real. Un adaptador real (Wompi, ePayco…) implementa esta interfaz y devuelve
 * un resultado verificable de la pasarela; nunca se debe marcar como pagado sin esa evidencia.
 */
public interface PaymentGateway {

    String provider();

    /** Debe ser idempotente respecto a {@code idempotencyKey}: repetir la llamada no cobra dos veces. */
    ChargeResult charge(ChargeRequest request);

    record ChargeRequest(UUID clinicId, UUID chargeId, BigDecimal amount, String currency, String tokenRef,
                         String idempotencyKey) {}

    record ChargeResult(boolean approved, String providerRef, String failureReason) {}
}
