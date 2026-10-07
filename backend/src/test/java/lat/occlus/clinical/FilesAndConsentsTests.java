package lat.occlus.clinical;

import static lat.occlus.support.ApiClient.bearer;
import static lat.occlus.support.ApiClient.createUserAndLogin;
import static lat.occlus.support.ApiClient.registerClinic;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.util.Base64;
import lat.occlus.TestcontainersConfiguration;
import lat.occlus.shared.tenant.TenantContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class FilesAndConsentsTests {

    /** PNG válido de 1x1 píxel. */
    static final String PNG_BASE64 =
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    static final byte[] PNG = Base64.getDecoder().decode(PNG_BASE64);

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcTemplate jdbc;

    String token;
    String patientId;

    @BeforeEach
    void setUp() throws Exception {
        token = registerClinic(mvc, "Clínica Archivos");
        patientId = createPatient(token, "60000001", "1985-03-03", null);
    }

    // ---------- Archivos ----------

    @Test
    void uploadListAndDownload() throws Exception {
        String id = JsonPath.read(upload(token, PNG, "rx.png", "RADIOGRAPH", "Panorámica")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.contentType").value("image/png"))
                .andReturn().getResponse().getContentAsString(), "$.id");

        mvc.perform(get("/api/patients/" + patientId + "/files").header("Authorization", bearer(token)))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].title").value("Panorámica"))
                .andExpect(jsonPath("$[0].uploadedBy.name").value("Admin"));

        byte[] downloaded = mvc.perform(get("/api/files/" + id + "/content").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/png"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andReturn().getResponse().getContentAsByteArray();
        assertThat(downloaded).isEqualTo(PNG);
    }

    @Test
    void fileTypeIsDetectedFromContentNotFromName() throws Exception {
        // Un script disfrazado de imagen se rechaza.
        upload(token, "<script>alert(1)</script>".getBytes(), "foto.png", "PHOTO", null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Formato no permitido: usa JPG, PNG, WEBP o PDF"));
        // Un PDF real con nombre raro se acepta como PDF.
        upload(token, "%PDF-1.7\n%test".getBytes(), "documento.bin", "DOCUMENT", null)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.contentType").value("application/pdf"))
                .andExpect(jsonPath("$.title").value("documento"));
    }

    @Test
    void accessRules() throws Exception {
        String id = JsonPath.read(upload(token, PNG, "rx.png", "RADIOGRAPH", null)
                .andReturn().getResponse().getContentAsString(), "$.id");

        String reception = createUserAndLogin(mvc, token, "RECEPTION", false);
        mvc.perform(get("/api/patients/" + patientId + "/files").header("Authorization", bearer(reception)))
                .andExpect(status().isForbidden());

        String other = registerClinic(mvc, "Otra clínica");
        mvc.perform(get("/api/files/" + id + "/content").header("Authorization", bearer(other)))
                .andExpect(status().isNotFound());

        // Un auxiliar puede subir, pero no quitar lo que subió otro.
        String assistant = createUserAndLogin(mvc, token, "ASSISTANT", false);
        upload(assistant, PNG, "foto.png", "PHOTO", null).andExpect(status().isCreated());
        mvc.perform(post("/api/files/" + id + "/remove").header("Authorization", bearer(assistant))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"duplicado\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void removedFilesAreHiddenButKept() throws Exception {
        String id = JsonPath.read(upload(token, PNG, "rx.png", "RADIOGRAPH", null)
                .andReturn().getResponse().getContentAsString(), "$.id");
        mvc.perform(post("/api/files/" + id + "/remove").header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Subida por error\"}"))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/patients/" + patientId + "/files").header("Authorization", bearer(token)))
                .andExpect(jsonPath("$.length()").value(0));
        // Sigue existiendo para auditoría.
        mvc.perform(get("/api/files/" + id + "/content").header("Authorization", bearer(token)))
                .andExpect(status().isOk());
        // Y la BD no deja borrarlo.
        assertThatThrownBy(() -> TenantContext.callAsSystem(() -> jdbc.update("delete from patient_file where id = ?::uuid", id)))
                .hasStackTraceContaining("permission denied for table patient_file");
    }

    // ---------- Consentimientos ----------

    @Test
    void signConsentFromExampleTemplate() throws Exception {
        String templateId = loadExamplesAndPickFirst();

        String json = sign(token, patientId, templateId, "Paciente", "Resina en 36")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.integrityOk").value(true))
                .andExpect(jsonPath("$.signerRelationship").value("Paciente"))
                .andExpect(jsonPath("$.professional.name").value("Admin"))
                .andReturn().getResponse().getContentAsString();

        String body = JsonPath.read(json, "$.body");
        assertThat(body).contains("Laura Pérez").contains("CC 60000001").contains("Resina en 36").doesNotContain("{{");

        // La firma se guardó como archivo, pero no aparece entre los adjuntos.
        String signatureId = JsonPath.read(json, "$.signatureFileId");
        byte[] signature = mvc.perform(get("/api/files/" + signatureId + "/content").header("Authorization", bearer(token)))
                .andReturn().getResponse().getContentAsByteArray();
        assertThat(signature).isEqualTo(PNG);
        mvc.perform(get("/api/patients/" + patientId + "/files").header("Authorization", bearer(token)))
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void minorMustBeSignedByGuardian() throws Exception {
        String minor = createPatient(token, "60000002", LocalDate.now().minusYears(10).toString(), "Carmen Díaz");
        String templateId = loadExamplesAndPickFirst();
        sign(token, minor, templateId, "Paciente", null)
                .andExpect(status().isBadRequest());
        String body = JsonPath.read(sign(token, minor, templateId, "Madre", null)
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "$.body");
        // El texto deja claro que firma la acudiente en nombre de la paciente.
        assertThat(body).startsWith("Yo, Laura Pérez, identificado(a) con CC 60000001, en calidad de madre del(de la) paciente Laura Pérez (CC 60000002),");
    }

    @Test
    void signedConsentIsImmutableAndRevocableOnce() throws Exception {
        String templateId = loadExamplesAndPickFirst();
        String id = JsonPath.read(sign(token, patientId, templateId, "Paciente", null)
                .andReturn().getResponse().getContentAsString(), "$.id");

        assertThatThrownBy(() -> TenantContext.callAsSystem(() ->
                jdbc.update("update consent set body = 'alterado' where id = ?::uuid", id)))
                .hasMessageContaining("no se puede modificar");
        assertThatThrownBy(() -> TenantContext.callAsSystem(() ->
                jdbc.update("delete from consent where id = ?::uuid", id)))
                .hasMessageContaining("no se puede borrar");

        mvc.perform(post("/api/consents/" + id + "/revoke").header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"El paciente decidió no tratarse\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revokedBy.name").value("Admin"))
                .andExpect(jsonPath("$.integrityOk").value(true));
        mvc.perform(post("/api/consents/" + id + "/revoke").header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"otra vez\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void onlyProfessionalsSignAndOnlyAdminsEditTemplates() throws Exception {
        String templateId = loadExamplesAndPickFirst();
        String assistant = createUserAndLogin(mvc, token, "ASSISTANT", false);
        sign(assistant, patientId, templateId, "Paciente", null).andExpect(status().isForbidden());
        mvc.perform(post("/api/consent-templates").header("Authorization", bearer(assistant))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"X\",\"body\":\"Y\"}"))
                .andExpect(status().isForbidden());
        // Una firma que no es PNG se rechaza.
        mvc.perform(post("/api/patients/" + patientId + "/consents").header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"templateId":"%s","signerName":"Laura Pérez","signerDocument":"CC 1",
                                 "signerRelationship":"Paciente","signaturePng":"%s"}"""
                                .formatted(templateId, Base64.getEncoder().encodeToString("no soy png".getBytes()))))
                .andExpect(status().isBadRequest());
    }

    // ---------- helpers ----------

    private ResultActions upload(String token, byte[] content, String filename, String category, String title)
            throws Exception {
        var req = multipart("/api/patients/" + patientId + "/files")
                .file(new MockMultipartFile("file", filename, "image/png", content))
                .param("category", category)
                .header("Authorization", bearer(token));
        if (title != null) req.param("title", title);
        return mvc.perform(req);
    }

    private String loadExamplesAndPickFirst() throws Exception {
        String json = mvc.perform(post("/api/consent-templates/examples").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(json, "$[0].id");
    }

    private ResultActions sign(String token, String patient, String templateId, String relationship, String procedure)
            throws Exception {
        return mvc.perform(post("/api/patients/" + patient + "/consents").header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON).content("""
                        {"templateId":"%s","procedureDetail":%s,"signerName":"Laura Pérez","signerDocument":"CC 60000001",
                         "signerRelationship":"%s","signaturePng":"data:image/png;base64,%s"}"""
                        .formatted(templateId, procedure == null ? "null" : "\"" + procedure + "\"", relationship, PNG_BASE64)));
    }

    private String createPatient(String token, String doc, String birthDate, String guardian) throws Exception {
        String json = """
                {"documentType":"CC","documentNumber":"%s","firstName":"Laura","firstLastName":"Pérez",
                 "birthDate":"%s","sex":"M","regime":"CONTRIBUTIVO"%s}"""
                .formatted(doc, birthDate, guardian == null ? "" : ",\"guardianName\":\"" + guardian + "\"");
        return JsonPath.read(mvc.perform(post("/api/patients").header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
    }
}
