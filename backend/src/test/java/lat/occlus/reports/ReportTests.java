package lat.occlus.reports;

import static lat.occlus.support.ApiClient.bearer;
import static lat.occlus.support.ApiClient.createUserAndLogin;
import static lat.occlus.support.ApiClient.registerClinic;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.closeTo;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import lat.occlus.TestcontainersConfiguration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Escenario con valores conocidos:
 * <ul>
 *   <li>Paciente A: realizado 210.000 (resina 120.000 + profilaxis 90.000; otra resina pendiente),
 *       pagó 100.000 en efectivo + 50.000 por transferencia, y un pago de 30.000 anulado → debe 60.000.</li>
 *   <li>Paciente B: pagó 20.000 sin procedimientos → anticipo de 20.000.</li>
 *   <li>Ayer: una cita atendida, una inasistencia y una cancelada.</li>
 * </ul>
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ReportTests {

    static final ZoneId BOGOTA = ZoneId.of("America/Bogota");

    @Autowired
    MockMvc mvc;

    String admin;
    String siteId;
    String dentistId;
    String patientA;
    String patientB;
    LocalDate today;
    LocalDate yesterday;

    @BeforeEach
    void setUp() throws Exception {
        today = LocalDate.now(BOGOTA);
        yesterday = today.minusDays(1);
        admin = registerClinic(mvc, "Clínica Reportes");
        siteId = JsonPath.read(json(get("/api/sites")), "$[0].id");
        dentistId = JsonPath.read(json(get("/api/professionals")), "$[0].id");
        patientA = createPatient("80000001", "Ana");
        // Nombre que empieza por "=": comprueba que el CSV no lo deja como fórmula de Excel.
        patientB = createPatient("80000002", "=HYPERLINK");

        json(post("/api/procedures/examples"));
        String procedures = json(get("/api/procedures"));
        String resin = idByName(procedures, "Resina de fotocurado");
        String cleaning = idByName(procedures, "Profilaxis y detartraje");

        String plan = JsonPath.read(json(post("/api/patients/" + patientA + "/treatment-plans")
                .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Plan\"}")), "$.id");
        call(post("/api/treatment-plans/" + plan + "/items").contentType(MediaType.APPLICATION_JSON).content("""
                {"items":[{"procedureId":"%1$s","tooth":36},{"procedureId":"%2$s"},{"procedureId":"%1$s","tooth":46}]}"""
                .formatted(resin, cleaning)), admin).andExpect(status().isOk());
        call(post("/api/treatment-plans/" + plan + "/accept"), admin).andExpect(status().isOk());
        List<String> items = JsonPath.read(json(get("/api/treatment-plans/" + plan)), "$.items[*].id");
        for (String item : items.subList(0, 2)) {
            call(post("/api/treatment-plans/" + plan + "/items/" + item + "/status").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"status\":\"DONE\"}"), admin).andExpect(status().isOk());
        }

        call(post("/api/cash-sessions").contentType(MediaType.APPLICATION_JSON)
                .content("{\"siteId\":\"%s\",\"openingAmount\":0}".formatted(siteId)), admin).andExpect(status().isCreated());
        pay(patientA, 100_000, "CASH");
        pay(patientA, 50_000, "TRANSFER");
        String wrong = JsonPath.read(pay(patientA, 30_000, "CASH"), "$.id");
        call(post("/api/payments/" + wrong + "/void").contentType(MediaType.APPLICATION_JSON)
                .content("{\"reason\":\"Error de digitación\"}"), admin).andExpect(status().isOk());
        pay(patientB, 20_000, "CASH");

        appointment(patientA, 8, "ATTENDED");
        appointment(patientA, 9, "NO_SHOW");
        appointment(patientB, 10, "CANCELLED");
    }

    @Test
    void periodReport() throws Exception {
        report(yesterday, today, null)
                .andExpect(status().isOk())
                // Recaudo: 100.000 + 50.000 + 20.000; el anulado va aparte.
                .andExpect(jsonPath("$.revenue.total").value(170000))
                .andExpect(jsonPath("$.revenue.count").value(3))
                .andExpect(jsonPath("$.revenue.voidedTotal").value(30000))
                .andExpect(jsonPath("$.revenue.voidedCount").value(1))
                .andExpect(jsonPath("$.revenue.byMethod[0].method").value("CASH"))
                .andExpect(jsonPath("$.revenue.byMethod[0].total").value(120000))
                .andExpect(jsonPath("$.revenue.byDay.length()").value(2))
                .andExpect(jsonPath("$.revenue.byDay[0].total").value(0))
                .andExpect(jsonPath("$.revenue.byDay[1].total").value(170000))
                .andExpect(jsonPath("$.revenue.bySite[0].total").value(170000))
                // Producción: solo lo realizado.
                .andExpect(jsonPath("$.production.total").value(210000))
                .andExpect(jsonPath("$.production.items").value(2))
                .andExpect(jsonPath("$.production.byProfessional[0].professional.name").value("Admin"))
                .andExpect(jsonPath("$.production.byCategory[0].category").value("RESTORATIVE"))
                .andExpect(jsonPath("$.production.topProcedures[0].name").value("Resina de fotocurado"))
                // Agenda.
                .andExpect(jsonPath("$.appointments.total").value(3))
                .andExpect(jsonPath("$.appointments.byStatus.ATTENDED").value(1))
                .andExpect(jsonPath("$.appointments.byStatus.NO_SHOW").value(1))
                .andExpect(jsonPath("$.appointments.byStatus.CANCELLED").value(1))
                .andExpect(jsonPath("$.appointments.attendanceRate").value(closeTo(0.5, 0.001)))
                .andExpect(jsonPath("$.appointments.byProfessional[0].noShow").value(1))
                // Pacientes.
                .andExpect(jsonPath("$.patients.newPatients").value(2))
                .andExpect(jsonPath("$.patients.attended").value(1));
    }

    @Test
    void siteFilterAndEmptyPeriods() throws Exception {
        String north = JsonPath.read(json(post("/api/sites").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Sede Norte\"}")), "$.id");
        report(yesterday, today, north)
                .andExpect(jsonPath("$.site.name").value("Sede Norte"))
                .andExpect(jsonPath("$.revenue.total").value(0))
                .andExpect(jsonPath("$.appointments.total").value(0))
                .andExpect(jsonPath("$.appointments.attendanceRate").doesNotExist());
        // Un periodo pasado sin movimientos.
        report(today.minusDays(40), today.minusDays(30), null)
                .andExpect(jsonPath("$.revenue.total").value(0))
                .andExpect(jsonPath("$.revenue.byDay.length()").value(11))
                .andExpect(jsonPath("$.production.total").value(0));
    }

    @Test
    void invalidRanges() throws Exception {
        report(today, yesterday, null).andExpect(status().isBadRequest());
        report(today.minusYears(2), today, null).andExpect(status().isBadRequest());
    }

    @Test
    void receivables() throws Exception {
        call(get("/api/reports/receivables"), admin)
                .andExpect(jsonPath("$.totalOwed").value(60000))
                .andExpect(jsonPath("$.debtorCount").value(1))
                .andExpect(jsonPath("$.totalAdvances").value(20000))
                .andExpect(jsonPath("$.debtors[0].fullName").value("Ana Ríos"))
                .andExpect(jsonPath("$.debtors[0].done").value(210000))
                .andExpect(jsonPath("$.debtors[0].paid").value(150000))
                .andExpect(jsonPath("$.debtors[0].balance").value(60000));
    }

    @Test
    void paymentsCsv() throws Exception {
        var res = call(get("/api/reports/payments.csv").param("from", yesterday.toString()).param("to", today.toString()), admin)
                .andExpect(status().isOk())
                .andReturn().getResponse();
        assertThat(res.getHeader("Content-Disposition")).contains("attachment").contains(".csv");
        String csv = res.getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        var lines = csv.split("\r\n");
        assertThat(lines[0]).startsWith("﻿Recibo;Fecha;Paciente");
        assertThat(lines).hasSize(5); // encabezado + 4 pagos
        assertThat(csv).contains("000001;").contains(";100000;CASH;").contains("Anulado").contains("Error de digitación");
        // Inyección de fórmulas: el nombre "=HYPERLINK…" queda como texto.
        assertThat(csv).contains("'=HYPERLINK Ríos").doesNotContain(";=HYPERLINK");
    }

    @Test
    void onlyAdminsAndOnlyOwnClinic() throws Exception {
        String reception = createUserAndLogin(mvc, admin, "RECEPTION", false);
        String dentist = createUserAndLogin(mvc, admin, "DENTIST", true);
        for (String token : List.of(reception, dentist)) {
            call(get("/api/reports").param("from", today.toString()).param("to", today.toString()), token)
                    .andExpect(status().isForbidden());
            call(get("/api/reports/receivables"), token).andExpect(status().isForbidden());
        }
        String other = registerClinic(mvc, "Otra clínica");
        call(get("/api/reports").param("from", yesterday.toString()).param("to", today.toString()), other)
                .andExpect(jsonPath("$.revenue.total").value(0))
                .andExpect(jsonPath("$.production.total").value(0));
        call(get("/api/reports/receivables"), other).andExpect(jsonPath("$.debtorCount").value(0));
        // Filtrar por una sede de otra clínica no es válido.
        call(get("/api/reports").param("from", today.toString()).param("to", today.toString()).param("siteId", siteId), other)
                .andExpect(status().isBadRequest());
    }

    // ---------- helpers ----------

    private ResultActions call(MockHttpServletRequestBuilder req, String token) throws Exception {
        return mvc.perform(req.header("Authorization", bearer(token)));
    }

    private String json(MockHttpServletRequestBuilder req) throws Exception {
        return call(req, admin).andReturn().getResponse().getContentAsString();
    }

    private ResultActions report(LocalDate from, LocalDate to, String site) throws Exception {
        var req = get("/api/reports").param("from", from.toString()).param("to", to.toString());
        if (site != null) req.param("siteId", site);
        return call(req, admin);
    }

    private String pay(String patient, long amount, String method) throws Exception {
        return call(post("/api/patients/" + patient + "/payments").contentType(MediaType.APPLICATION_JSON)
                .content("{\"siteId\":\"%s\",\"amount\":%d,\"method\":\"%s\"}".formatted(siteId, amount, method)), admin)
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
    }

    private void appointment(String patient, int hour, String finalStatus) throws Exception {
        String start = yesterday.atTime(hour, 0).atZone(BOGOTA).toOffsetDateTime().toString();
        String id = JsonPath.read(call(post("/api/appointments").contentType(MediaType.APPLICATION_JSON).content("""
                {"patientId":"%s","dentistId":"%s","siteId":"%s","startsAt":"%s","durationMinutes":30}"""
                .formatted(patient, dentistId, siteId, start)), admin)
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
        call(patch("/api/appointments/" + id + "/status").contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"%s\"}".formatted(finalStatus)), admin).andExpect(status().isOk());
    }

    private String createPatient(String doc, String firstName) throws Exception {
        return JsonPath.read(json(post("/api/patients").contentType(MediaType.APPLICATION_JSON).content("""
                {"documentType":"CC","documentNumber":"%s","firstName":"%s","firstLastName":"Ríos",
                 "birthDate":"1985-05-05","sex":"M","regime":"CONTRIBUTIVO"}""".formatted(doc, firstName))), "$.id");
    }

    private static String idByName(String json, String name) {
        List<String> ids = JsonPath.read(json, "$[?(@.name == '" + name + "')].id");
        return ids.getFirst();
    }
}
