package lat.occlus.messaging;

import static lat.occlus.support.ApiClient.bearer;
import static lat.occlus.support.ApiClient.registerClinic;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;
import java.util.Map;
import lat.occlus.TestcontainersConfiguration;
import org.junit.jupiter.api.BeforeEach;
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
class AppointmentInviteTests {

    static final ZoneOffset CO = ZoneOffset.ofHours(-5);
    static final OffsetDateTime MONDAY_8 = LocalDate.now(CO).with(TemporalAdjusters.next(DayOfWeek.MONDAY))
            .atTime(8, 0).atOffset(CO);

    @Autowired
    MockMvc mvc;

    String token;
    String dentistId;
    String siteId;

    @BeforeEach
    void setUp() throws Exception {
        token = registerClinic(mvc, "Consultorio Invitaciones");
        dentistId = JsonPath.read(getJson("/api/professionals"), "$[0].id");
        siteId = JsonPath.read(getJson("/api/sites"), "$[0].id");
        send(put("/api/sites/" + siteId), """
                {"name":"Sede Principal","address":"Calle 38 #8-53 Barrio Nariño","city":"Montería","phone":"3007298109"}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.address").value("Calle 38 #8-53 Barrio Nariño"));
    }

    @Test
    void inviteUsesTheTemplateOfTheVisitTypeAndTheSiteData() throws Exception {
        String patient = createPatient("50000001", "300 123 4567");
        String appointment = createAppointment(patient, "FIRST_VISIT");

        String json = getJson("/api/appointments/" + appointment + "/whatsapp-invite");
        String message = JsonPath.read(json, "$.message");
        String url = JsonPath.read(json, "$.url");
        assertThat((String) JsonPath.read(json, "$.phone")).isEqualTo("573001234567");
        assertThat(message).startsWith("Señor(a) Ricardo,")
                .contains("primera cita en Sede Principal es el "
                        + MONDAY_8.format(DateTimeFormatter.ofPattern("dd/MM/yyyy")) + " a las 08:00 AM")
                .contains("Consultorio Invitaciones", "Teléfono 3007298109",
                        "Dirección Calle 38 #8-53 Barrio Nariño Montería");
        assertThat(url).startsWith("https://wa.me/573001234567?text=").doesNotContain("+");
        assertThat(URLDecoder.decode(url.substring(url.indexOf("=") + 1), StandardCharsets.UTF_8)).isEqualTo(message);
    }

    @Test
    void clinicCanEditAndResetEachMessage() throws Exception {
        String patient = createPatient("50000002", "3001234567");
        String appointment = createAppointment(patient, "PREVENTION");

        send(put("/api/appointment-messages/PREVENTION"), "{\"body\":\"Hola {nombre}, tu cita de {motivo} es el {fecha}.\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.custom").value(true));
        assertThat((String) JsonPath.read(getJson("/api/appointments/" + appointment + "/whatsapp-invite"), "$.message"))
                .isEqualTo("Hola Ricardo, tu cita de Promoción y prevención (P&P) es el "
                        + MONDAY_8.format(DateTimeFormatter.ofPattern("dd/MM/yyyy")) + ".");

        send(put("/api/appointment-messages/PREVENTION"), "{\"body\":\"Hola {cliente}\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Dato no reconocido en el mensaje: {cliente}"));

        mvc.perform(delete("/api/appointment-messages/PREVENTION").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.custom").value(false));
        mvc.perform(get("/api/appointment-messages").header("Authorization", bearer(token)))
                .andExpect(jsonPath("$.length()").value(4))
                .andExpect(jsonPath("$[3].visitType").value("PREVENTION"))
                .andExpect(jsonPath("$[3].custom").value(false));
    }

    @Test
    void withoutAValidMobileThereIsNoLinkButTheMessageIsReady() throws Exception {
        String patient = createPatient("50000003", "6047654321");
        String appointment = createAppointment(patient, null);
        String json = getJson("/api/appointments/" + appointment + "/whatsapp-invite");
        assertThat((Object) JsonPath.read(json, "$.url")).isNull();
        assertThat((String) JsonPath.read(json, "$.message")).contains("cita de control");
    }

    @Test
    void linesWhoseDataIsEmptyAreDropped() {
        String text = AppointmentInvites.render("""
                Hola {nombre}
                Teléfono {telefono}
                Dirección {direccion} {ciudad}
                Fin""", Map.of("nombre", "Ana", "direccion", "Calle 1"));
        assertThat(text).isEqualTo("Hola Ana\nDirección Calle 1\nFin");
    }

    // ---------- helpers ----------

    private String createAppointment(String patient, String visitType) throws Exception {
        String type = visitType == null ? "" : ",\"visitType\":\"%s\"".formatted(visitType);
        return JsonPath.read(send(post("/api/appointments"), """
                {"patientId":"%s","dentistId":"%s","siteId":"%s","startsAt":"%s","durationMinutes":30%s}"""
                .formatted(patient, dentistId, siteId, MONDAY_8, type))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.visitType").value(visitType))
                .andReturn().getResponse().getContentAsString(), "$.id");
    }

    private String createPatient(String doc, String phone) throws Exception {
        return JsonPath.read(send(post("/api/patients"), """
                {"documentType":"CC","documentNumber":"%s","firstName":"Ricardo","firstLastName":"Algarín",
                 "birthDate":"1990-01-01","sex":"H","regime":"CONTRIBUTIVO","phone":"%s"}""".formatted(doc, phone))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
    }

    private org.springframework.test.web.servlet.ResultActions send(
            org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req, String json) throws Exception {
        return mvc.perform(req.header("Authorization", bearer(token)).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private String getJson(String path) throws Exception {
        return mvc.perform(get(path).header("Authorization", bearer(token)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }
}
