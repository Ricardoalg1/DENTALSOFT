package lat.occlus.dictation;

import static lat.occlus.support.ApiClient.bearer;
import static lat.occlus.support.ApiClient.registerClinic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import lat.occlus.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

/** Sin clave de Groq el dictado en línea queda apagado: el navegador transcribe solo. */
@SpringBootTest(properties = "occlus.dictation.groq-api-key=")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class DictationDisabledTests {

    @Autowired
    MockMvc mvc;

    @Test
    void remoteDictationIsOffWithoutKey() throws Exception {
        String token = registerClinic(mvc, "Dictado sin clave");
        mvc.perform(get("/api/dictation").header("Authorization", bearer(token)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.remote").value(false));
        mvc.perform(post("/api/dictation/transcribe").header("Authorization", bearer(token))
                        .contentType("audio/wav").content(DictationTests.wav(1)))
                .andExpect(status().isServiceUnavailable());
    }
}
