package lat.occlus.clinical;

import static lat.occlus.support.ApiClient.bearer;
import static lat.occlus.support.ApiClient.createUserAndLogin;
import static lat.occlus.support.ApiClient.registerClinic;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ClinicalRecordTests {

    static final ZoneOffset CO = ZoneOffset.ofHours(-5);

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcTemplate jdbc;

    /** Administrador que registró la clínica: también es profesional. */
    String token;
    String patientId;

    @BeforeEach
    void setUp() throws Exception {
        token = registerClinic(mvc, "Clínica Historias");
        patientId = createPatient(token, "50000001");
    }

    // ---------- Acceso ----------

    @Test
    void receptionCannotSeeTheClinicalRecord() throws Exception {
        String reception = createUserAndLogin(mvc, token, "RECEPTION", false);
        call(reception, get("/api/patients/" + patientId + "/clinical-background")).andExpect(status().isForbidden());
        call(reception, get("/api/patients/" + patientId + "/clinical-notes")).andExpect(status().isForbidden());
        call(reception, get("/api/patients/" + patientId + "/odontogram")).andExpect(status().isForbidden());
        // Pero sí ve los datos administrativos del paciente.
        call(reception, get("/api/patients/" + patientId)).andExpect(status().isOk());
    }

    @Test
    void assistantCanReadButOnlyProfessionalsWrite() throws Exception {
        String assistant = createUserAndLogin(mvc, token, "ASSISTANT", false);
        call(assistant, get("/api/patients/" + patientId + "/clinical-background")).andExpect(status().isOk());
        call(assistant, put("/api/patients/" + patientId + "/clinical-background").content(background("[]")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("Solo los profesionales pueden escribir en la historia clínica"));
        call(assistant, post("/api/patients/" + patientId + "/odontogram").content(mark(36, "O", "CARIES")))
                .andExpect(status().isForbidden());
    }

    @Test
    void otherClinicCannotSeeTheRecord() throws Exception {
        String noteId = createNote(null);
        String other = registerClinic(mvc, "Otra clínica HC");
        call(other, get("/api/clinical-notes/" + noteId)).andExpect(status().isNotFound());
        call(other, get("/api/patients/" + patientId + "/clinical-background")).andExpect(status().isNotFound());
        call(other, get("/api/patients/" + patientId + "/odontogram")).andExpect(status().isNotFound());
    }

    // ---------- Antecedentes ----------

    @Test
    void backgroundIsCreatedThenReplaced() throws Exception {
        call(token, get("/api/patients/" + patientId + "/clinical-background"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.updatedAt").doesNotExist())
                .andExpect(jsonPath("$.conditions.length()").value(0));

        call(token, put("/api/patients/" + patientId + "/clinical-background")
                        .content(background("[\"PREGNANCY\",\"HYPERTENSION\"]")))
                .andExpect(status().isOk())
                // Se devuelven en el orden del catálogo, no en el que llegaron.
                .andExpect(jsonPath("$.conditions[0]").value("HYPERTENSION"))
                .andExpect(jsonPath("$.allergies").value("Penicilina"))
                .andExpect(jsonPath("$.updatedBy.name").value("Admin"));

        call(token, put("/api/patients/" + patientId + "/clinical-background").content(background("[]")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.conditions.length()").value(0));

        call(token, put("/api/patients/" + patientId + "/clinical-background").content(background("[\"NOPE\"]")))
                .andExpect(status().isBadRequest());
    }

    // ---------- Evoluciones ----------

    @Test
    void noteLifecycleDraftSignAddendum() throws Exception {
        String appointmentId = createPastAppointment();
        String noteId = createNote(appointmentId);

        // Sin diagnóstico no se puede firmar.
        call(token, post("/api/clinical-notes/" + noteId + "/sign")).andExpect(status().isBadRequest());

        call(token, put("/api/clinical-notes/" + noteId).content(note(null, "k02.1", "[\"K05.1\", \"K021\"]")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.diagnosisMain.code").value("K021"))
                .andExpect(jsonPath("$.diagnosisMain.display").value("K02.1"))
                // El repetido (igual al principal) se descarta.
                .andExpect(jsonPath("$.diagnosisRelated.length()").value(1))
                .andExpect(jsonPath("$.diagnosisRelated[0].code").value("K051"));

        call(token, post("/api/clinical-notes/" + noteId + "/sign"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SIGNED"))
                .andExpect(jsonPath("$.integrityOk").value(true))
                .andExpect(jsonPath("$.contentHash").isString());

        // Firmar la evolución cierra la cita como atendida.
        call(token, get("/api/appointments/" + appointmentId)).andExpect(jsonPath("$.status").value("ATTENDED"));

        // Firmada: no se edita ni se borra…
        call(token, put("/api/clinical-notes/" + noteId).content(note(null, "K021", "[]")))
                .andExpect(status().isConflict());
        call(token, delete("/api/clinical-notes/" + noteId)).andExpect(status().isConflict());
        // …se complementa con notas aclaratorias.
        call(token, post("/api/clinical-notes/" + noteId + "/addenda").content("{\"text\":\"Se aclara: diente 36\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.addenda.length()").value(1))
                .andExpect(jsonPath("$.addenda[0].author.name").value("Admin"));

        // Una cita, una evolución.
        call(token, post("/api/patients/" + patientId + "/clinical-notes").content(note(appointmentId, null, "[]")))
                .andExpect(status().isConflict());
    }

    @Test
    void signedNoteIsImmutableEvenWithDirectSql() throws Exception {
        String noteId = createNote(null);
        call(token, put("/api/clinical-notes/" + noteId).content(note(null, "K040", "[]"))).andExpect(status().isOk());
        call(token, post("/api/clinical-notes/" + noteId + "/sign")).andExpect(status().isOk());

        UUID clinicId = clinicId(token);
        assertThatThrownBy(() -> TenantContext.callAs(clinicId,
                () -> jdbc.update("update clinical_note set plan = 'alterado' where id = ?::uuid", noteId)))
                .hasStackTraceContaining("está firmada y no se puede modificar");
        assertThatThrownBy(() -> TenantContext.callAs(clinicId,
                () -> jdbc.update("delete from clinical_note where id = ?::uuid", noteId)))
                .hasStackTraceContaining("está firmada y no se puede modificar");
    }

    @Test
    void onlyTheAuthorEditsOrSignsADraft() throws Exception {
        String noteId = createNote(null);
        String otherDentist = createUserAndLogin(mvc, token, "DENTIST", true);
        call(otherDentist, put("/api/clinical-notes/" + noteId).content(note(null, null, "[]")))
                .andExpect(status().isForbidden());
        call(otherDentist, post("/api/clinical-notes/" + noteId + "/sign")).andExpect(status().isForbidden());

        // Los borradores propios aparecen como pendientes, y el autor sí puede borrarlos.
        call(token, get("/api/clinical-notes").param("scope", "my-drafts"))
                .andExpect(jsonPath("$.length()").value(1));
        call(token, delete("/api/clinical-notes/" + noteId)).andExpect(status().isNoContent());
        call(token, get("/api/clinical-notes").param("scope", "my-drafts"))
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void noteValidation() throws Exception {
        call(token, post("/api/patients/" + patientId + "/clinical-notes").content(note(null, "X999", "[]")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("El diagnóstico X999 no está en el catálogo CIE-10"));
        String future = OffsetDateTime.now(CO).plusDays(1).toString();
        call(token, post("/api/patients/" + patientId + "/clinical-notes")
                        .content("{\"attendedAt\":\"%s\",\"reason\":\"Dolor\"}".formatted(future)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void icd10SearchIgnoresAccentsAndDots() throws Exception {
        call(token, get("/api/icd10").param("q", "erupcion"))
                .andExpect(jsonPath("$[*].code", org.hamcrest.Matchers.hasItem("K006")));
        call(token, get("/api/icd10").param("q", "K02.1"))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].description").value("Caries de la dentina"));
    }

    // ---------- Odontograma ----------

    @Test
    void odontogramRules() throws Exception {
        String base = "/api/patients/" + patientId + "/odontogram";
        call(token, post(base).content(mark(36, "O", "CARIES"))).andExpect(status().isOk());
        String afterCaries = OffsetDateTime.now(CO).toString();
        Thread.sleep(5);

        // Una superficie, un estado: la resina reemplaza a la caries.
        call(token, post(base).content(mark(36, "O", "RESIN")))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].condition").value("RESIN"));
        // Otra superficie y una marca de diente completo conviven.
        call(token, post(base).content(mark(36, "M", "CARIES"))).andExpect(jsonPath("$.length()").value(2));
        call(token, post(base).content(mark(36, null, "ROOT_CANAL_INDICATED"))).andExpect(jsonPath("$.length()").value(3));
        // La endodoncia hecha reemplaza a la indicada.
        call(token, post(base).content(mark(36, null, "ROOT_CANAL")))
                .andExpect(jsonPath("$[*].condition", containsInAnyOrder("RESIN", "CARIES", "ROOT_CANAL")));
        // Repetir una marca vigente no duplica.
        call(token, post(base).content(mark(36, null, "ROOT_CANAL"))).andExpect(jsonPath("$.length()").value(3));

        // Ausente reemplaza todo y bloquea otras marcas.
        String missing = JsonPath.read(call(token, post(base).content(mark(36, null, "MISSING")))
                .andExpect(jsonPath("$.length()").value(1))
                .andReturn().getResponse().getContentAsString(), "$[0].id");
        call(token, post(base).content(mark(36, "D", "CARIES"))).andExpect(status().isConflict());

        // Quitar deja el diente vacío, pero queda en el historial.
        call(token, delete(base + "/" + missing)).andExpect(jsonPath("$.length()").value(0));
        call(token, delete(base + "/" + missing)).andExpect(status().isConflict());
        call(token, get(base + "/history")).andExpect(jsonPath("$.length()").value(6));

        // El odontograma de antes: solo estaba la caries oclusal.
        call(token, get(base).param("at", afterCaries))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].condition").value("CARIES"))
                .andExpect(jsonPath("$[0].surface").value("O"));
    }

    @Test
    void odontogramValidation() throws Exception {
        String base = "/api/patients/" + patientId + "/odontogram";
        call(token, post(base).content(mark(19, "O", "CARIES"))).andExpect(status().isBadRequest()); // no existe
        call(token, post(base).content(mark(56, "O", "CARIES"))).andExpect(status().isBadRequest()); // temporales hasta 5
        call(token, post(base).content(mark(55, "O", "CARIES"))).andExpect(status().isOk());
        call(token, post(base).content(mark(11, null, "CARIES"))).andExpect(status().isBadRequest()); // falta superficie
        call(token, post(base).content(mark(11, "V", "CROWN"))).andExpect(status().isBadRequest()); // sobra superficie
    }

    // ---------- helpers ----------

    private ResultActions call(String token, MockHttpServletRequestBuilder req) throws Exception {
        return mvc.perform(req.header("Authorization", bearer(token)).contentType(MediaType.APPLICATION_JSON));
    }

    private String createNote(String appointmentId) throws Exception {
        String json = call(token, post("/api/patients/" + patientId + "/clinical-notes").content(note(appointmentId, null, "[]")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(json, "$.id");
    }

    private static String note(String appointmentId, String dx, String related) {
        return """
                {"appointmentId":%s,"reason":"Dolor en molar inferior","examination":"Cavidad en 36",
                 "diagnosisMain":%s,"diagnosisType":"CONFIRMED_NEW","diagnosisRelated":%s,"procedures":"Resina oclusal 36"}"""
                .formatted(quoted(appointmentId), quoted(dx), related);
    }

    private static String background(String conditions) {
        return """
                {"conditions":%s,"habits":["BRUXISM"],"allergies":"Penicilina","medications":" "}""".formatted(conditions);
    }

    private static String mark(int tooth, String surface, String condition) {
        return """
                {"tooth":%d,"surface":%s,"condition":"%s"}""".formatted(tooth, quoted(surface), condition);
    }

    private static String quoted(String s) {
        return s == null ? "null" : "\"" + s + "\"";
    }

    /** Cita de ayer: ya empezó, así que al firmar la evolución puede quedar como atendida. */
    private String createPastAppointment() throws Exception {
        String dentistId = JsonPath.read(getJson("/api/professionals"), "$[0].id");
        String siteId = JsonPath.read(getJson("/api/sites"), "$[0].id");
        String start = OffsetDateTime.now(CO).minusDays(1).withHour(10).withMinute(0).withSecond(0).withNano(0).toString();
        String json = call(token, post("/api/appointments").content("""
                        {"patientId":"%s","dentistId":"%s","siteId":"%s","startsAt":"%s","durationMinutes":30}"""
                        .formatted(patientId, dentistId, siteId, start)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(json, "$.id");
    }

    private String getJson(String path) throws Exception {
        return call(token, get(path)).andReturn().getResponse().getContentAsString();
    }

    private UUID clinicId(String token) throws Exception {
        return UUID.fromString(JsonPath.read(getJson("/api/auth/me"), "$.clinicId"));
    }

    private String createPatient(String token, String doc) throws Exception {
        String json = """
                {"documentType":"CC","documentNumber":"%s","firstName":"Paciente","firstLastName":"Historia",
                 "birthDate":"1985-05-05","sex":"M","regime":"CONTRIBUTIVO"}""".formatted(doc);
        return JsonPath.read(call(token, post("/api/patients").content(json))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
    }
}
