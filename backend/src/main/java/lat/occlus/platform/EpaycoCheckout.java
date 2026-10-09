package lat.occlus.platform;

import java.math.BigDecimal;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;

/**
 * ePayco: checkout alojado + confirmación firmada. Solo pago por la página de ePayco (cada periodo
 * lo paga la clínica); no se hace cobro recurrente por API.
 *
 * <p>Firma de la confirmación: SHA-256 de
 * {@code p_cust_id_cliente^p_key^x_ref_payco^x_transaction_id^x_amount^x_currency_code}.
 */
@Slf4j
@Component
class EpaycoCheckout implements HostedCheckout {

    private final PaymentProperties.Epayco cfg;
    private final RestClient http;

    EpaycoCheckout(PaymentProperties props) {
        this.cfg = props.epayco();
        if (!cfg.enabled()) {
            this.http = null;
            return;
        }
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build());
        factory.setReadTimeout(Duration.ofSeconds(20));
        this.http = RestClient.builder().requestFactory(factory).baseUrl(cfg.validationUrl()).build();
    }

    @Override
    public String provider() {
        return "EPAYCO";
    }

    @Override
    public boolean enabled() {
        return cfg.enabled();
    }

    /** Parámetros para {@code ePayco.checkout.configure/open} (el monto va en pesos, sin centavos). */
    @Override
    public CheckoutSession start(CheckoutRequest r) {
        String amount = r.amount().stripTrailingZeros().toPlainString();
        var p = new LinkedHashMap<String, String>();
        p.put("key", cfg.publicKey());
        p.put("test", String.valueOf(cfg.test()));
        p.put("name", "Suscripción Occlus");
        p.put("description", r.description());
        p.put("invoice", r.reference());
        p.put("currency", r.currency().toLowerCase());
        p.put("amount", amount);
        p.put("tax_base", amount);
        p.put("tax", "0");
        p.put("country", "co");
        p.put("lang", "es");
        p.put("external", "true");
        p.put("response", r.returnUrl());
        p.put("confirmation", r.confirmationUrl());
        p.put("method_confirmation", "POST");
        p.put("extra1", r.extra());
        if (r.customerEmail() != null) p.put("email_billing", r.customerEmail());
        return new CheckoutSession(provider(), null, p);
    }

    @Override
    public Payment fetch(String providerRef) {
        JsonNode body = http.get().uri("/{ref}", providerRef).retrieve().body(JsonNode.class);
        JsonNode data = body == null ? null : body.path("data");
        if (data == null || data.isMissingNode() || data.path("x_ref_payco").asString("").isBlank()) {
            return new Payment(Status.PENDING, providerRef, "", BigDecimal.ZERO, "", "Sin datos de la transacción");
        }
        // Si la respuesta trae firma, debe corresponder a nuestras llaves.
        String sig = data.path("x_signature").asString("");
        if (!sig.isBlank() && !Hashing.constantTimeEquals(sig, signature(data.path("x_ref_payco").asString(),
                data.path("x_transaction_id").asString(), data.path("x_amount").asString(), data.path("x_currency_code").asString()))) {
            throw new InvalidSignatureException("La validación de ePayco no coincide con nuestras llaves");
        }
        return new Payment(status(data.path("x_cod_response").asString("")), data.path("x_ref_payco").asString(),
                data.path("x_id_invoice").asString(""), decimal(data.path("x_amount").asString("0")),
                data.path("x_currency_code").asString("").toUpperCase(), data.path("x_response").asString(""));
    }

    @Override
    public Optional<WebhookEvent> verifyWebhook(WebhookInput in) {
        Map<String, String> p = in.params();
        String ref = p.getOrDefault("x_ref_payco", "");
        String expected = signature(ref, p.getOrDefault("x_transaction_id", ""), p.getOrDefault("x_amount", ""),
                p.getOrDefault("x_currency_code", ""));
        if (ref.isBlank() || !Hashing.constantTimeEquals(expected, p.getOrDefault("x_signature", ""))) {
            throw new InvalidSignatureException("Firma inválida");
        }
        String invoice = p.getOrDefault("x_id_invoice", "");
        return invoice.isBlank() ? Optional.empty() : Optional.of(new WebhookEvent(ref, invoice));
    }

    private String signature(String ref, String transactionId, String amount, String currency) {
        return Hashing.sha256Hex(String.join("^", cfg.customerId(), cfg.pKey(), ref, transactionId, amount, currency));
    }

    /** x_cod_response: 1 aceptada, 3 pendiente, 7 retenida (pendiente de revisión); 2 rechazada, 4 fallida, 6 reversada… */
    private static Status status(String code) {
        return switch (code) {
            case "1" -> Status.APPROVED;
            case "3", "7" -> Status.PENDING;
            default -> Status.DECLINED;
        };
    }

    private static BigDecimal decimal(String s) {
        try {
            return new BigDecimal(s.trim());
        } catch (NumberFormatException e) {
            return BigDecimal.ZERO;
        }
    }
}
