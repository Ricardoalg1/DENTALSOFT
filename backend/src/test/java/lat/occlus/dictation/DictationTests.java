package lat.occlus.dictation;

import static lat.occlus.support.ApiClient.bearer;
import static lat.occlus.support.ApiClient.registerClinic;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;
import lat.occlus.TestcontainersConfiguration;
import lat.occlus.shared.tenant.TenantContext;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/** Dictado en línea contra un Groq simulado: formato del audio, tope mensual por clínica y fallos del proveedor. */
@SpringBootTest(properties = {"occlus.dictation.groq-api-key=clave-de-prueba", "occlus.dictation.monthly-minutes-per-clinic=1"})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class DictationTests {

    /** Imita POST /openai/v1/audio/transcriptions de Groq. */
    static final class FakeGroq {
        final HttpServer server;
        final AtomicInteger calls = new AtomicInteger();
        volatile int status = 200;
        volatile String lastAuthorization;
        volatile String lastBody;

        FakeGroq() {
            try {
                server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
            server.createContext("/openai/v1/audio/transcriptions", exchange -> {
                calls.incrementAndGet();
                lastAuthorization = exchange.getRequestHeaders().getFirst("Authorization");
                lastBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.ISO_8859_1);
                byte[] out = (status == 200 ? "{\"text\":\" Paciente refiere dolor. \"}" : "{\"error\":{}}")
                        .getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(status, out.length);
                exchange.getResponseBody().write(out);
                exchange.close();
            });
            server.start();
        }

        String url() {
            return "http://127.0.0.1:" + server.getAddress().getPort() + "/openai/v1/audio/transcriptions";
        }
    }

    static final FakeGroq groq = new FakeGroq();

    @DynamicPropertySource
    static void groqUrl(DynamicPropertyRegistry registry) {
        registry.add("occlus.dictation.groq-url", groq::url);
    }

    @AfterAll
    static void stop() {
        groq.server.stop(0);
    }

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcTemplate db;

    /** WAV como el que arma el navegador: PCM de 16 bits, mono, 16 kHz. */
    static byte[] wav(double seconds) {
        int data = (int) (seconds * 16000) * 2;
        var b = ByteBuffer.allocate(44 + data).order(ByteOrder.LITTLE_ENDIAN);
        b.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(36 + data).put("WAVE".getBytes(StandardCharsets.US_ASCII));
        b.put("fmt ".getBytes(StandardCharsets.US_ASCII)).putInt(16).putShort((short) 1).putShort((short) 1)
                .putInt(16000).putInt(32000).putShort((short) 2).putShort((short) 16);
        b.put("data".getBytes(StandardCharsets.US_ASCII)).putInt(data);
        return b.array();
    }

    private org.springframework.test.web.servlet.ResultActions send(String token, byte[] audio) throws Exception {
        return mvc.perform(post("/api/dictation/transcribe").header("Authorization", bearer(token))
                .contentType("audio/wav").content(audio));
    }

    private int usedSeconds(String clinicName) {
        return TenantContext.callAsSystem(() -> db.queryForObject("""
                select coalesce(sum(u.seconds), 0) from dictation_usage u join clinic c on c.id = u.clinic_id
                where c.name = ?""", Integer.class, clinicName));
    }

    @Test
    void transcribesWithGroqAndCountsAtLeastTenSeconds() throws Exception {
        String token = registerClinic(mvc, "Dictado uno");
        mvc.perform(get("/api/dictation").header("Authorization", bearer(token)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.remote").value(true));

        send(token, wav(2)).andExpect(status().isOk()).andExpect(jsonPath("$.text").value("Paciente refiere dolor."));

        assertThat(groq.lastAuthorization).isEqualTo("Bearer clave-de-prueba");
        assertThat(groq.lastBody).contains("whisper-large-v3-turbo").contains("name=\"language\"").contains("frase.wav");
        assertThat(usedSeconds("Dictado uno")).isEqualTo(10);
    }

    @Test
    void stopsAtTheMonthlyLimitOfEachClinic() throws Exception {
        String token = registerClinic(mvc, "Dictado tope");
        for (int i = 0; i < 6; i++) send(token, wav(1)).andExpect(status().isOk());
        int calls = groq.calls.get();

        mvc.perform(get("/api/dictation").header("Authorization", bearer(token)))
                .andExpect(jsonPath("$.remote").value(false)).andExpect(jsonPath("$.usedMinutes").value(1));
        send(token, wav(1)).andExpect(status().isTooManyRequests());
        assertThat(groq.calls.get()).isEqualTo(calls);

        String other = registerClinic(mvc, "Dictado otra");
        mvc.perform(get("/api/dictation").header("Authorization", bearer(other))).andExpect(jsonPath("$.remote").value(true));
    }

    @Test
    void rejectsAudioThatIsNotTheExpectedWav() throws Exception {
        String token = registerClinic(mvc, "Dictado formato");
        int calls = groq.calls.get();
        send(token, "no es audio, solo texto suficientemente largo para pasar el encabezado".getBytes(StandardCharsets.UTF_8))
                .andExpect(status().isBadRequest());
        send(token, wav(31)).andExpect(status().isBadRequest());
        assertThat(groq.calls.get()).isEqualTo(calls);
    }

    @Test
    void providerFailureIsReportedAndNotCounted() throws Exception {
        String token = registerClinic(mvc, "Dictado falla");
        groq.status = 500;
        try {
            send(token, wav(2)).andExpect(status().isBadGateway());
            groq.status = 429;
            send(token, wav(2)).andExpect(status().isServiceUnavailable());
        } finally {
            groq.status = 200;
        }
        assertThat(usedSeconds("Dictado falla")).isZero();
    }

    @Test
    void requiresAuthentication() throws Exception {
        mvc.perform(post("/api/dictation/transcribe").contentType("audio/wav").content(wav(1)))
                .andExpect(status().isUnauthorized());
    }
}
