package lat.occlus.messaging;

import java.util.List;
import java.util.Map;
import java.time.Duration;
import java.net.http.HttpClient;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;

/** Envío real por WhatsApp Cloud API (Meta): POST /{versión}/{phone-number-id}/messages. */
@Slf4j
class WhatsAppCloudSender implements MessageSender {

    private final RestClient http;

    WhatsAppCloudSender(MessagingProperties.WhatsApp config) {
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build());
        factory.setReadTimeout(Duration.ofSeconds(15));
        this.http = RestClient.builder()
                .requestFactory(factory)
                .baseUrl("https://graph.facebook.com/%s/%s".formatted(config.apiVersion(), config.phoneNumberId()))
                .defaultHeader("Authorization", "Bearer " + config.accessToken())
                .build();
    }

    @Override
    public SendResult sendTemplate(String to, String template, String language, List<String> bodyParams) {
        var parameters = bodyParams.stream().map(p -> Map.of("type", "text", "text", p)).toList();
        return post(Map.of(
                "messaging_product", "whatsapp",
                "to", to,
                "type", "template",
                "template", Map.of(
                        "name", template,
                        "language", Map.of("code", language),
                        "components", List.of(Map.of("type", "body", "parameters", parameters)))));
    }

    @Override
    public SendResult sendText(String to, String text) {
        return post(Map.of(
                "messaging_product", "whatsapp",
                "to", to,
                "type", "text",
                "text", Map.of("body", text)));
    }

    private SendResult post(Map<String, Object> body) {
        try {
            JsonNode res = http.post().uri("/messages").contentType(MediaType.APPLICATION_JSON).body(body)
                    .retrieve().body(JsonNode.class);
            JsonNode id = res == null ? null : res.path("messages").path(0).path("id");
            return id == null || !id.isString() || id.asString().isBlank() ? SendResult.failed("Respuesta sin id de mensaje; revisar antes de reenviar") : SendResult.ok(id.asString());
        } catch (RestClientResponseException e) {
            log.warn("WhatsApp respondió HTTP {}", e.getStatusCode());
            return SendResult.failed("WhatsApp respondió HTTP " + e.getStatusCode().value());
        } catch (RuntimeException e) {
            log.warn("No se pudo completar el envío WhatsApp ({})", e.getClass().getSimpleName());
            return SendResult.failed("Envío no confirmado; revisa el proveedor antes de reenviar.");
        }
    }

    @Override
    public boolean simulated() {
        return false;
    }
}
