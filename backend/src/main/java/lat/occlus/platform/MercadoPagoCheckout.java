package lat.occlus.platform;

import java.math.BigDecimal;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Mercado Pago, Checkout Pro. Referencia: https://www.mercadopago.com.co/developers/es/docs/checkout-pro
 *
 * <ul>
 *   <li>Pago con redirección: se crea una preferencia ({@code POST /checkout/preferences}) con nuestra
 *       referencia en {@code external_reference} y se lleva a la persona a {@code init_point}.</li>
 *   <li>Estado: {@code GET /v1/payments/{id}}; siempre se consulta, nunca se cree lo que diga el navegador.</li>
 *   <li>Webhooks: cabecera {@code x-signature: ts=…,v1=…}, donde v1 es HMAC-SHA256 (clave secreta de webhooks)
 *       de {@code id:<data.id>;request-id:<x-request-id>;ts:<ts>;}. Además se re-consulta el pago.</li>
 * </ul>
 * Sin cobro automático: cada periodo lo paga la clínica (igual que ePayco).
 */
@Slf4j
@Component
class MercadoPagoCheckout implements HostedCheckout {

    private final PaymentProperties.MercadoPago cfg;
    private final ObjectMapper mapper;
    private final RestClient http;

    MercadoPagoCheckout(PaymentProperties props, ObjectMapper mapper) {
        this.cfg = props.mercadopago();
        this.mapper = mapper;
        if (!cfg.enabled()) {
            this.http = null;
            return;
        }
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build());
        factory.setReadTimeout(Duration.ofSeconds(20));
        this.http = RestClient.builder().requestFactory(factory).baseUrl(cfg.baseUrl())
                .defaultHeader("Authorization", "Bearer " + cfg.accessToken()).build();
    }

    @Override
    public String provider() {
        return "MERCADOPAGO";
    }

    @Override
    public boolean enabled() {
        return cfg.enabled();
    }

    // ---------- Checkout alojado ----------

    @Override
    public CheckoutSession start(CheckoutRequest r) {
        var item = new LinkedHashMap<String, Object>();
        item.put("id", "suscripcion-occlus");
        item.put("title", r.description());
        item.put("quantity", 1);
        item.put("currency_id", r.currency());
        item.put("unit_price", r.amount());
        var body = new LinkedHashMap<String, Object>();
        body.put("items", List.of(item));
        body.put("external_reference", r.reference());
        // Mercado Pago agrega ?payment_id=…&status=… a estas direcciones; el estado se consulta igual.
        body.put("back_urls", Map.of("success", r.returnUrl(), "failure", r.returnUrl(), "pending", r.returnUrl()));
        body.put("auto_return", "approved");
        body.put("notification_url", r.confirmationUrl());
        body.put("statement_descriptor", "OCCLUS");
        body.put("metadata", Map.of("checkout_id", r.extra()));
        if (r.customerEmail() != null) body.put("payer", Map.of("email", r.customerEmail()));

        JsonNode res = http.post().uri("/checkout/preferences")
                .contentType(MediaType.APPLICATION_JSON)
                .header("X-Idempotency-Key", r.reference())
                .body(mapper.writeValueAsString(body))
                .retrieve().body(JsonNode.class);
        String url = res == null ? "" : res.path(cfg.test() ? "sandbox_init_point" : "init_point").asString("");
        if (url.isBlank() && res != null) url = res.path("init_point").asString("");
        if (!url.startsWith("https://") && !url.startsWith("http://")) {
            throw new IllegalStateException("Mercado Pago no devolvió la dirección de pago");
        }
        return new CheckoutSession(provider(), url, Map.of());
    }

    @Override
    public Payment fetch(String paymentId) {
        if (!paymentId.matches("\\d{1,20}")) {
            return new Payment(Status.PENDING, paymentId, "", BigDecimal.ZERO, "", "Identificador de pago no válido");
        }
        return toPayment(http.get().uri("/v1/payments/{id}", paymentId).retrieve().body(JsonNode.class));
    }

    /** La persona volvió sin el id del pago: se busca por nuestra referencia (el aprobado, si hay varios). */
    @Override
    public Optional<Payment> findByReference(String reference) {
        JsonNode res = http.get().uri(u -> u.path("/v1/payments/search")
                        .queryParam("external_reference", reference)
                        .queryParam("sort", "date_created").queryParam("criteria", "desc").build())
                .retrieve().body(JsonNode.class);
        if (res == null || !res.path("results").isArray() || res.path("results").isEmpty()) return Optional.empty();
        JsonNode chosen = res.path("results").get(0);
        for (JsonNode p : res.path("results")) {
            if ("approved".equals(p.path("status").asString(""))) {
                chosen = p;
                break;
            }
        }
        return Optional.of(toPayment(chosen));
    }

    // ---------- Webhooks ----------

    @Override
    public Optional<WebhookEvent> verifyWebhook(WebhookInput in) {
        String dataId = in.params().getOrDefault("data.id", "");
        String type = in.params().getOrDefault("type", in.params().getOrDefault("topic", ""));
        if ((dataId.isBlank() || type.isBlank()) && !in.rawBody().isBlank()) {
            JsonNode body = mapper.readTree(in.rawBody());
            if (dataId.isBlank()) dataId = body.path("data").path("id").asString("");
            if (type.isBlank()) type = body.path("type").asString("");
        }
        verifySignature(in.headers().getOrDefault("x-signature", ""), in.headers().getOrDefault("x-request-id", ""), dataId);
        // Solo interesan los pagos (también llegan avisos de órdenes, reclamos…).
        if (!"payment".equals(type) || dataId.isBlank()) return Optional.empty();
        Payment p = fetch(dataId);
        return p.reference().isBlank() ? Optional.empty() : Optional.of(new WebhookEvent(p.providerRef(), p.reference()));
    }

    private void verifySignature(String header, String requestId, String dataId) {
        String ts = "", v1 = "";
        for (String part : header.split(",")) {
            String[] kv = part.trim().split("=", 2);
            if (kv.length != 2) continue;
            if (kv[0].equals("ts")) ts = kv[1].trim();
            if (kv[0].equals("v1")) v1 = kv[1].trim();
        }
        if (ts.isBlank() || v1.isBlank()) throw new InvalidSignatureException("Falta la firma");
        // Los valores ausentes se omiten de la plantilla; los ids alfanuméricos se firman en minúsculas.
        String id = dataId.toLowerCase(Locale.ROOT);
        var manifest = new StringBuilder();
        if (!id.isBlank()) manifest.append("id:").append(id).append(';');
        if (!requestId.isBlank()) manifest.append("request-id:").append(requestId).append(';');
        manifest.append("ts:").append(ts).append(';');
        if (!Hashing.constantTimeEquals(hmacSha256Hex(manifest.toString()), v1.toLowerCase(Locale.ROOT))) {
            throw new InvalidSignatureException("Firma inválida");
        }
    }

    private String hmacSha256Hex(String message) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(cfg.webhookSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(message.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new IllegalStateException(e);
        }
    }

    // ---------- Respuestas ----------

    private static Payment toPayment(JsonNode p) {
        if (p == null || p.path("id").isMissingNode()) {
            return new Payment(Status.PENDING, "", "", BigDecimal.ZERO, "", "Sin datos del pago");
        }
        return new Payment(status(p.path("status").asString("")), p.path("id").asString(),
                p.path("external_reference").asString(""), decimal(p.path("transaction_amount").asString("0")),
                p.path("currency_id").asString("").toUpperCase(Locale.ROOT), p.path("status_detail").asString(""));
    }

    /** approved: pagado. pending/in_process/authorized/in_mediation: aún no. rejected/cancelled/refunded/charged_back: no. */
    private static Status status(String s) {
        return switch (s) {
            case "approved" -> Status.APPROVED;
            case "pending", "in_process", "authorized", "in_mediation" -> Status.PENDING;
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
