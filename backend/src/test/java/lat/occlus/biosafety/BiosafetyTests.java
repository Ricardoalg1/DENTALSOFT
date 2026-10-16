package lat.occlus.biosafety;

import static lat.occlus.support.ApiClient.bearer;
import static lat.occlus.support.ApiClient.createUserAndLogin;
import static lat.occlus.support.ApiClient.registerClinic;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.time.ZoneId;
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
class BiosafetyTests {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcTemplate jdbc;

    String admin;
    String siteId;

    @BeforeEach
    void setUp() throws Exception {
        admin = registerClinic(mvc, "Clínica Bioseguridad");
        siteId = JsonPath.read(call(get("/api/sites"), admin).andReturn().getResponse().getContentAsString(), "$[0].id");
    }

    @Test
    void recordsAreValidatedByKindAndRaiseAlerts() throws Exception {
        String assistant = createUserAndLogin(mvc, admin, "ASSISTANT", false);
        // El auxiliar registra la esterilización; un indicador no conforme es una alerta.
        record(assistant, "STERILIZATION", """
                {"equipment":"Autoclave 1","cycleNumber":"145","temperature":134,"durationMin":18,
                 "chemicalIndicator":"FAIL","biologicalIndicator":"NOT_APPLICABLE","ignored":"x"}""")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.alert").value("Indicador químico no conforme"))
                .andExpect(jsonPath("$.data.ignored").doesNotExist())
                .andExpect(jsonPath("$.data.temperature").value(134.0));
        record(admin, "ENVIRONMENT", "{\"place\":\"REFRIGERATOR\",\"temperature\":\"9,5\",\"humidity\":40}")
                .andExpect(jsonPath("$.alert").value("Nevera fuera de 2–8 °C"));
        record(admin, "WASTE", "{\"wasteType\":\"SHARPS\",\"weightKg\":1.2,\"collector\":\"Ecocapital\"}")
                .andExpect(status().isCreated()).andExpect(jsonPath("$.alert").doesNotExist());
        String due = LocalDate.now(ZoneId.of("America/Bogota")).plusDays(10).toString();
        record(admin, "MAINTENANCE", "{\"equipment\":\"Compresor\",\"maintenanceType\":\"PREVENTIVE\",\"nextDue\":\"" + due + "\"}")
                .andExpect(status().isCreated());

        // Validación: campo obligatorio, opción inválida, rango.
        record(admin, "WASTE", "{\"weightKg\":1}").andExpect(status().isBadRequest());
        record(admin, "CLEANING", "{\"area\":\"PATIO\",\"cleaningType\":\"ROUTINE\",\"product\":\"Hipoclorito\"}").andExpect(status().isBadRequest());
        record(admin, "ENVIRONMENT", "{\"place\":\"ROOM\",\"temperature\":120}").andExpect(status().isBadRequest());

        call(get("/api/biosafety?kind=STERILIZATION"), admin).andExpect(jsonPath("$.totalElements").value(1));
        call(get("/api/biosafety/summary"), assistant)
                .andExpect(jsonPath("$.alerts.length()").value(2))
                .andExpect(jsonPath("$.maintenanceDue[0].equipment").value("Compresor"))
                .andExpect(jsonPath("$.maintenanceDue[0].overdue").value(false))
                .andExpect(jsonPath("$.counts[?(@.kind=='WASTE')].last30Days").value(org.hamcrest.Matchers.contains(1)));
    }

    @Test
    void onlyAdminsVoidAndRecordsAreImmutable() throws Exception {
        String id = JsonPath.read(record(admin, "CLEANING", "{\"area\":\"OPERATORY\",\"cleaningType\":\"TERMINAL\",\"product\":\"Amonio cuaternario\"}")
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
        String reception = createUserAndLogin(mvc, admin, "RECEPTION", false);
        call(post("/api/biosafety/" + id + "/void").contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Error\"}"), reception)
                .andExpect(status().isForbidden());
        call(post("/api/biosafety/" + id + "/void").contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Error\"}"), admin)
                .andExpect(status().isOk()).andExpect(jsonPath("$.voidReason").value("Error"));
        UUID clinicId = UUID.fromString(JsonPath.read(call(get("/api/auth/me"), admin).andReturn().getResponse().getContentAsString(), "$.clinicId"));
        assertThatThrownBy(() -> TenantContext.callAs(clinicId,
                () -> jdbc.update("update biosafety_record set notes = 'x' where id = ?::uuid", id)))
                .hasStackTraceContaining("ya fue anulado");
    }

    private ResultActions record(String token, String kind, String data) throws Exception {
        return call(post("/api/biosafety").contentType(MediaType.APPLICATION_JSON).content(
                "{\"siteId\":\"%s\",\"kind\":\"%s\",\"data\":%s}".formatted(siteId, kind, data)), token);
    }

    private ResultActions call(MockHttpServletRequestBuilder req, String token) throws Exception {
        return mvc.perform(req.header("Authorization", bearer(token)));
    }
}
