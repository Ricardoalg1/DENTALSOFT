package lat.occlus.platform;

import java.math.BigDecimal;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Wompi (Bancolombia). Referencia: https://docs.wompi.co
 *
 * <ul>
 *   <li>Pago con redirección: Web Checkout con firma de integridad calculada aquí (nunca en el navegador).</li>
 *   <li>Cobro recurrente: fuente de pago (tarjeta tokenizada en el navegador con la llave pública) y
 *       {@code POST /transactions} con {@code recurrent=true}.</li>
 *   <li>Webhooks: checksum SHA-256 con el secreto de eventos; además SIEMPRE se re-consulta la transacción.</li>
 * </ul>
 */
@Slf4j
@Component
class WompiGateway implements PaymentGateway, HostedCheckout {

    private static final String CHECKOUT_URL = "https://checkout.wompi.co/p/";

    private final PaymentProperties.Wompi cfg;
    private final ObjectMapper mapper;
    private final RestClient http;

    WompiGateway(PaymentProperties props, ObjectMapper mapper) {
        this.cfg = props.wompi();
        this.mapper = mapper;
        if (!cfg.enabled()) {
            this.http = null;
            return;
        }
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build());
        factory.setReadTimeout(Duration.ofSeconds(20));
        this.http = RestClient.builder().requestFactory(factory).baseUrl(cfg.baseUrl()).build();
    }

    @Override
    public String provider() {
        return "WOMPI";
    }

    @Override
    public boolean enabled() {
        return cfg.enabled();
    }

    // ---------- Checkout alojado ----------

    @Override
    public CheckoutSession start(CheckoutRequest r) {
        long cents = cents(r.amount());
        // Firma de integridad: SHA-256(referencia + monto en centavos + moneda + secreto de integridad).
        String signature = Hashing.sha256Hex(r.reference() + cents + r.currency() + cfg.integritySecret());
        var url = UriComponentsBuilder.fromUriString(CHECKOUT_URL)
                .queryParam("public-key", cfg.publicKey())
                .queryParam("currency", r.currency())
                .queryParam("amount-in-cents", cents)
                .queryParam("reference", r.reference())
                .queryParam("signature:integrity", signature)
                .queryParam("redirect-url", r.returnUrl());
        if (r.customerEmail() != null) url.queryParam("customer-data:email", r.customerEmail());
        return new CheckoutSession(provider(), url.build().encode().toUriString(), Map.of());
    }

    @Override
    public Payment fetch(String providerRef) {
        JsonNode data = get("/transactions/" + encode(providerRef)).path("data");
        return toPayment(data);
    }

    @Override
    public Optional<Payment> findByReference(String reference) {
        JsonNode list = get("/transactions?reference=" + encode(reference)).path("data");
        if (!list.isArray() || list.isEmpty()) return Optional.empty();
        // Si hubo varios intentos con la misma referencia, interesa uno aprobado.
        Payment last = null;
        for (JsonNode tx : list) {
            Payment p = toPayment(tx);
            if (p.status() == Status.APPROVED) return Optional.of(p);
            last = p;
        }
        return Optional.ofNullable(last);
    }

    @Override
    public Optional<WebhookEvent> verifyWebhook(WebhookInput in) {
        JsonNode event;
        try {
            event = mapper.readTree(in.rawBody());
        } catch (RuntimeException e) {
            throw new InvalidSignatureException("Cuerpo ilegible");
        }
        JsonNode signature = event.path("signature");
        JsonNode props = signature.path("properties");
        String checksum = signature.path("checksum").asString("");
        if (!props.isArray() || checksum.isBlank() || !event.path("timestamp").isNumber()) {
            throw new InvalidSignatureException("Falta la firma");
        }
        // SHA-256(valores de signature.properties, en orden, + timestamp + secreto de eventos).
        var concatenated = new StringBuilder();
        for (JsonNode path : props) {
            JsonNode value = event.path("data");
            for (String key : path.asString("").split("\\.")) value = value.path(key);
            if (value.isMissingNode() || value.isNull()) throw new InvalidSignatureException("Propiedad ausente");
            concatenated.append(value.isString() ? value.asString() : value.toString());
        }
        concatenated.append(event.path("timestamp").asLong()).append(cfg.eventsSecret());
        if (!Hashing.constantTimeEquals(Hashing.sha256Hex(concatenated.toString()), checksum)) {
            throw new InvalidSignatureException("Firma inválida");
        }
        String header = in.headers().get("x-event-checksum");
        if (header != null && !Hashing.constantTimeEquals(header, checksum)) throw new InvalidSignatureException("Firma inválida");

        if (!"transaction.updated".equals(event.path("event").asString(""))) return Optional.empty();
        JsonNode tx = event.path("data").path("transaction");
        String id = tx.path("id").asString("");
        String reference = tx.path("reference").asString("");
        return id.isBlank() || reference.isBlank() ? Optional.empty() : Optional.of(new WebhookEvent(id, reference));
    }

    // ---------- Cobro con tarjeta guardada ----------

    @Override
    public ChargeResult charge(ChargeRequest r) {
        long sourceId;
        try {
            sourceId = Long.parseLong(r.tokenRef().trim());
        } catch (NumberFormatException e) {
            return ChargeResult.declined("El medio de pago guardado no es una fuente de Wompi válida");
        }
        long cents = cents(r.amount());
        var body = new HashMap<String, Object>();
        body.put("amount_in_cents", cents);
        body.put("currency", r.currency());
        body.put("customer_email", r.customerEmail());
        // La referencia incluye el intento: cada intento es una transacción distinta, y reintentar el mismo es rechazado.
        body.put("reference", r.idempotencyKey());
        body.put("payment_source_id", sourceId);
        body.put("signature", Hashing.sha256Hex(r.idempotencyKey() + cents + r.currency() + cfg.integritySecret()));
        body.put("recurrent", true);
        try {
            JsonNode created = http.post().uri("/transactions").header("Authorization", "Bearer " + cfg.privateKey())
                    .contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(JsonNode.class);
            JsonNode tx = created == null ? null : created.path("data");
            if (tx == null || tx.path("id").asString("").isBlank()) return ChargeResult.declined("Respuesta de Wompi sin transacción");
            String id = tx.path("id").asString();
            Payment p = toPayment(tx);
            // Una transacción nueva casi siempre nace PENDING: se espera unos segundos su resolución.
            for (int i = 0; i < 6 && p.status() == Status.PENDING; i++) {
                sleep(1500);
                p = fetch(id);
            }
            return switch (p.status()) {
                case APPROVED -> ChargeResult.approved(id);
                case DECLINED -> ChargeResult.declined(reason(p));
                case PENDING -> ChargeResult.pending(id);
            };
        } catch (RestClientResponseException e) {
            log.warn("Wompi rechazó el cobro con HTTP {}", e.getStatusCode().value());
            return ChargeResult.declined("Wompi respondió HTTP " + e.getStatusCode().value());
        }
    }

    // ---------- Tarjeta guardada desde el navegador ----------

    /** Datos que el navegador necesita para tokenizar la tarjeta DIRECTAMENTE con Wompi y aceptar sus términos. */
    public record Setup(String publicKey, String apiBase, String acceptanceToken, String acceptancePermalink,
                        String personalAuthToken, String personalAuthPermalink) {}

    public Setup setup() {
        JsonNode data = get("/merchants/" + encode(cfg.publicKey())).path("data");
        return new Setup(cfg.publicKey(), cfg.baseUrl(),
                data.path("presigned_acceptance").path("acceptance_token").asString(""),
                data.path("presigned_acceptance").path("permalink").asString(""),
                data.path("presigned_personal_data_auth").path("acceptance_token").asString(""),
                data.path("presigned_personal_data_auth").path("permalink").asString(""));
    }

    /** Convierte el token de tarjeta (creado en el navegador) en una fuente de pago reutilizable. Devuelve su id. */
    public String createPaymentSource(String cardToken, String email, String acceptanceToken, String personalAuthToken) {
        var body = Map.of("type", "CARD", "token", cardToken, "customer_email", email,
                "acceptance_token", acceptanceToken, "accept_personal_auth", personalAuthToken);
        try {
            JsonNode res = http.post().uri("/payment_sources").header("Authorization", "Bearer " + cfg.privateKey())
                    .contentType(MediaType.APPLICATION_JSON).body(body).retrieve().body(JsonNode.class);
            JsonNode data = res == null ? null : res.path("data");
            if (data == null || data.path("id").asString("").isBlank() || !"AVAILABLE".equals(data.path("status").asString(""))) {
                throw new IllegalStateException("Wompi no dejó disponible la fuente de pago");
            }
            return data.path("id").asString();
        } catch (RestClientResponseException e) {
            log.warn("Wompi rechazó crear la fuente de pago con HTTP {}", e.getStatusCode().value());
            throw new IllegalStateException("Wompi no aceptó la tarjeta (HTTP " + e.getStatusCode().value() + ")");
        }
    }

    // ---------- Apoyo ----------

    private JsonNode get(String path) {
        JsonNode body = http.get().uri(path).header("Authorization", "Bearer " + cfg.privateKey()).retrieve().body(JsonNode.class);
        return body == null ? mapper.createObjectNode() : body;
    }

    private Payment toPayment(JsonNode tx) {
        Status status = switch (tx.path("status").asString("")) {
            case "APPROVED" -> Status.APPROVED;
            case "PENDING" -> Status.PENDING;
            default -> Status.DECLINED; // DECLINED, VOIDED, ERROR
        };
        BigDecimal amount = BigDecimal.valueOf(tx.path("amount_in_cents").asLong(0)).movePointLeft(2);
        return new Payment(status, tx.path("id").asString(""), tx.path("reference").asString(""), amount,
                tx.path("currency").asString(""), tx.path("status_message").asString(tx.path("status").asString("")));
    }

    private static String reason(Payment p) {
        String m = p.message();
        return m == null || m.isBlank() ? "Rechazado por la pasarela" : "Rechazado por Wompi: " + (m.length() > 200 ? m.substring(0, 200) : m);
    }

    private static long cents(BigDecimal amount) {
        return amount.movePointRight(2).longValueExact();
    }

    private static String encode(String s) {
        return java.net.URLEncoder.encode(s, java.nio.charset.StandardCharsets.UTF_8);
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
