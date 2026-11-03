package lat.occlus.clinical;

import static lat.occlus.support.ApiClient.bearer;
import static lat.occlus.support.ApiClient.registerClinic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import lat.occlus.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class DocumentProfileTests {

    @Autowired
    MockMvc mvc;

    @Test
    void documentsAreSignedWithTheAuthorsProfileOnlyWithinTheClinic() throws Exception {
        String token = registerClinic(mvc, "Clínica Firmas");
        String other = registerClinic(mvc, "Clínica Ajena");
        String dentistId = JsonPath.read(mvc.perform(get("/api/professionals").header("Authorization", bearer(token)))
                .andReturn().getResponse().getContentAsString(), "$[0].id");
        mvc.perform(put("/api/users/me/document-profile").header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"registration\":\"RM 12345\"}"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/users/" + dentistId + "/document-profile").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.registration").value("RM 12345"))
                .andExpect(jsonPath("$.name").value(org.hamcrest.Matchers.startsWith("Dr(a). ")))
                .andExpect(jsonPath("$.defaultName").value(org.hamcrest.Matchers.startsWith("Dr(a). ")));

        // Nombre personalizado para firmar; vacío vuelve al predeterminado.
        mvc.perform(put("/api/users/me/document-profile").header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"registration\":\"RM 12345\",\"displayName\":\"  Dra. Camila Morales \"}"))
                .andExpect(jsonPath("$.name").value("Dra. Camila Morales"));
        mvc.perform(get("/api/users/" + dentistId + "/document-profile").header("Authorization", bearer(token)))
                .andExpect(jsonPath("$.name").value("Dra. Camila Morales"));
        mvc.perform(put("/api/users/me/document-profile").header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"registration\":\"RM 12345\",\"displayName\":\"\"}"))
                .andExpect(jsonPath("$.name").value(org.hamcrest.Matchers.startsWith("Dr(a). ")));
        // Otra clínica no puede leer el perfil (ni la firma) de este profesional.
        mvc.perform(get("/api/users/" + dentistId + "/document-profile").header("Authorization", bearer(other)))
                .andExpect(status().isNotFound());
    }
}
