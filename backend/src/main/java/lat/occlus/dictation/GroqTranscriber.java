package lat.occlus.dictation;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

/**
 * Transcribe una frase con Whisper en Groq. Ni el audio ni el texto se registran en los logs: son datos de salud.
 * Groq no guarda las peticiones si la cuenta tiene activada la retención cero.
 */
@Component
class GroqTranscriber {

    /** Orienta a Whisper hacia el vocabulario de una historia odontológica y la puntuación en español. */
    private static final String PROMPT = "Historia clínica odontológica. Paciente refiere dolor. Examen estomatológico: "
            + "caries oclusal, mesial, distal, vestibular, lingual, palatina; encía sin alteraciones; diente 46. "
            + "Obturación con resina, amalgama, endodoncia, exodoncia, profilaxis, periodontitis, gingivitis, lidocaína al 2 %.";

    private final DictationProperties props;
    private final ObjectMapper mapper;
    private final RestClient http;

    GroqTranscriber(DictationProperties props, ObjectMapper mapper) {
        this.props = props;
        this.mapper = mapper;
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build());
        factory.setReadTimeout(Duration.ofSeconds(20));
        this.http = RestClient.builder().requestFactory(factory).build();
    }

    String transcribe(byte[] wav) {
        var form = new LinkedMultiValueMap<String, Object>();
        form.add("file", new ByteArrayResource(wav) {
            @Override
            public String getFilename() {
                return "frase.wav";
            }
        });
        form.add("model", props.model());
        form.add("language", "es");
        form.add("prompt", PROMPT);
        form.add("temperature", "0");
        form.add("response_format", "json");
        try {
            String body = http.post().uri(props.groqUrl())
                    .header("Authorization", "Bearer " + props.groqApiKey())
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(form)
                    .retrieve()
                    .body(String.class);
            return mapper.readTree(body).path("text").asString("").trim();
        } catch (RestClientResponseException e) {
            if (e.getStatusCode().value() == 429) {
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "El dictado en línea está ocupado. Intenta en unos segundos.");
            }
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "No se pudo transcribir la frase. Intenta de nuevo.");
        } catch (RestClientException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "No se pudo transcribir la frase. Intenta de nuevo.");
        }
    }
}
