package lat.occlus.platform;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;

/**
 * Pago en la página de la pasarela (checkout alojado): la persona escribe su tarjeta allá, los
 * datos de tarjeta nunca pasan por Occlus. El resultado se confirma consultando a la pasarela, no
 * por lo que diga el navegador ni el cuerpo de un webhook.
 */
public interface HostedCheckout {

    String provider();

    boolean enabled();

    CheckoutSession start(CheckoutRequest request);

    /** Estado autoritativo de una transacción, consultado directamente a la pasarela. */
    Payment fetch(String providerRef);

    /** Búsqueda por la referencia que enviamos (para cuando el navegador volvió sin dar el id). */
    default Optional<Payment> findByReference(String reference) {
        return Optional.empty();
    }

    /**
     * Valida la firma de un webhook. Vacío si el evento es legítimo pero no nos interesa; lanza
     * {@link InvalidSignatureException} si la firma no coincide.
     */
    Optional<WebhookEvent> verifyWebhook(WebhookInput input);

    record CheckoutRequest(String reference, BigDecimal amount, String currency, String description, String customerEmail,
                           String returnUrl, String confirmationUrl, String extra) {}

    /** Wompi: redirigir a {@code redirectUrl}. ePayco: abrir su checkout con {@code params}. */
    record CheckoutSession(String provider, String redirectUrl, Map<String, String> params) {}

    enum Status { APPROVED, DECLINED, PENDING }

    record Payment(Status status, String providerRef, String reference, BigDecimal amount, String currency, String message) {}

    record WebhookInput(String rawBody, Map<String, String> params, Map<String, String> headers) {}

    record WebhookEvent(String providerRef, String reference) {}

    class InvalidSignatureException extends RuntimeException {
        public InvalidSignatureException(String message) {
            super(message);
        }
    }
}
