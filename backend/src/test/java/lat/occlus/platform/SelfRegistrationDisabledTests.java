package lat.occlus.platform;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import lat.occlus.TestcontainersConfiguration;
import lat.occlus.support.ApiClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/** En producción las clínicas las crea el equipo de Occlus desde el panel: el registro abierto se apaga. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
@TestPropertySource(properties = "occlus.platform.self-registration=false")
class SelfRegistrationDisabledTests {

    @Autowired
    MockMvc mvc;

    @Test
    void publicRegistrationIsRejectedWhenDisabled() throws Exception {
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content("""
                        {"clinicName":"Clínica Pirata","fullName":"Ana","email":"%s","password":"secreto123"}"""
                        .formatted(ApiClient.uniqueEmail("pirata"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("registro")));
    }
}
