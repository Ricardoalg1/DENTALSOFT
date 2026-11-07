package lat.occlus.booking;

import java.net.http.HttpClient;
import java.time.Duration;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;

/** Cloudflare Turnstile. Si Cloudflare no responde, se rechaza: una reserva de menos es mejor que un formulario abierto. */
@Component
@Slf4j
class TurnstileVerifier implements CaptchaVerifier {

    private final BookingProperties props;
    private final RestClient http;

    TurnstileVerifier(BookingProperties props) {
        this.props = props;
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build());
        factory.setReadTimeout(Duration.ofSeconds(8));
        this.http = RestClient.builder().requestFactory(factory).build();
    }

    @Override
    public boolean verify(String token, String clientIp) {
        if (!props.captchaConfigured()) return !props.captchaRequired();
        if (token == null || token.isBlank()) return false;
        var form = new LinkedMultiValueMap<String, String>();
        form.add("secret", props.turnstileSecret());
        form.add("response", token);
        if (clientIp != null && !clientIp.isBlank()) form.add("remoteip", clientIp);
        try {
            JsonNode res = http.post().uri("https://challenges.cloudflare.com/turnstile/v0/siteverify")
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().body(JsonNode.class);
            return res != null && res.path("success").asBoolean(false);
        } catch (RuntimeException e) {
            log.warn("No se pudo validar el captcha ({})", e.getClass().getSimpleName());
            return false;
        }
    }
}
