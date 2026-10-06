package lat.occlus.patient;

import static lat.occlus.support.ApiClient.bearer;
import static lat.occlus.support.ApiClient.registerClinic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
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
class PatientTests {

    @Autowired
    MockMvc mvc;

    @Test
    void createSearchAndGet() throws Exception {
        String token = registerClinic(mvc, "Clínica Pacientes");
        String id = create(token, patientJson("1020304050", "José", "Pérez", "1990-05-10", null));

        mvc.perform(get("/api/patients/" + id).header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fullName").value("José Pérez"))
                .andExpect(jsonPath("$.documentNumber").value("1020304050"));

        // Búsqueda sin tildes y por varias palabras (nombre + parte del documento).
        mvc.perform(get("/api/patients").param("q", "jose 10203").header("Authorization", bearer(token)))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].fullName").value("José Pérez"));
        mvc.perform(get("/api/patients").param("q", "maria").header("Authorization", bearer(token)))
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void duplicateDocumentIsConflictButAllowedInOtherClinic() throws Exception {
        String tokenA = registerClinic(mvc, "Clínica A");
        String tokenB = registerClinic(mvc, "Clínica B");
        String json = patientJson("555666777", "Ana", "Ruiz", "1985-01-01", null);

        create(tokenA, json);
        mvc.perform(post("/api/patients").header("Authorization", bearer(tokenA))
                        .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isConflict());
        // El mismo documento en otra clínica es otro paciente.
        create(tokenB, json);
    }

    @Test
    void minorRequiresGuardian() throws Exception {
        String token = registerClinic(mvc, "Clínica Niños");
        String birth = LocalDate.now().minusYears(8).toString();
        mvc.perform(post("/api/patients").header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content(patientJson("1111222", "Sofía", "Gómez", birth, null)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Para pacientes menores de edad el acudiente es obligatorio"));
        create(token, patientJson("1111222", "Sofía", "Gómez", birth, "Laura Gómez"));
    }

    @Test
    void invalidPayloadIsBadRequest() throws Exception {
        String token = registerClinic(mvc, "Clínica Validación");
        mvc.perform(post("/api/patients").header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"documentType\":\"CC\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void otherClinicCannotReadOrUpdate() throws Exception {
        String tokenA = registerClinic(mvc, "Clínica A");
        String tokenB = registerClinic(mvc, "Clínica B");
        String id = create(tokenA, patientJson("999888", "Luis", "Mora", "1970-03-03", null));

        mvc.perform(get("/api/patients/" + id).header("Authorization", bearer(tokenB)))
                .andExpect(status().isNotFound());
        mvc.perform(put("/api/patients/" + id).header("Authorization", bearer(tokenB))
                        .contentType(MediaType.APPLICATION_JSON).content(patientJson("999888", "X", "Y", "1970-03-03", null)))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/patients").header("Authorization", bearer(tokenB)))
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void updateIsAudited() throws Exception {
        String token = registerClinic(mvc, "Clínica Auditoría");
        String id = create(token, patientJson("12345678", "Carlos", "Díaz", "1980-07-07", null));

        String updated = patientJson("12345678", "Carlos", "Díaz", "1980-07-07", null)
                .replace("\"phone\":\"3001234567\"", "\"phone\":\"3109998877\"");
        mvc.perform(put("/api/patients/" + id).header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content(updated))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.phone").value("3109998877"));

        mvc.perform(get("/api/patients/" + id + "/history").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].type").value("UPDATED"))
                .andExpect(jsonPath("$[0].userName").value("Admin"))
                .andExpect(jsonPath("$[0].changes[0].field").value("Teléfono"))
                .andExpect(jsonPath("$[0].changes[0].before").value("3001234567"))
                .andExpect(jsonPath("$[0].changes[0].after").value("3109998877"))
                .andExpect(jsonPath("$[1].type").value("CREATED"));
    }

    private String create(String token, String json) throws Exception {
        String body = mvc.perform(post("/api/patients").header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    static String patientJson(String doc, String firstName, String lastName, String birthDate, String guardian) {
        return """
                {"documentType":"CC","documentNumber":"%s","firstName":"%s","firstLastName":"%s",
                 "birthDate":"%s","sex":"M","phone":"3001234567","regime":"CONTRIBUTIVO","insurer":"Sura"%s}"""
                .formatted(doc, firstName, lastName, birthDate,
                        guardian == null ? "" : ",\"guardianName\":\"" + guardian + "\"");
    }
}
