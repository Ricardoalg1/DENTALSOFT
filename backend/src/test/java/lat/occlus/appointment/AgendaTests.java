package lat.occlus.appointment;

import static lat.occlus.support.ApiClient.bearer;
import static lat.occlus.support.ApiClient.registerClinic;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
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
class AgendaTests {

    static final ZoneOffset CO = ZoneOffset.ofHours(-5);
    /** Próximo lunes a las 09:00 en Colombia. */
    static final OffsetDateTime MONDAY_9 = LocalDate.now(CO).with(TemporalAdjusters.next(DayOfWeek.MONDAY))
            .atTime(9, 0).atOffset(CO);

    @Autowired
    MockMvc mvc;

    String token;
    String dentistId;
    String siteId;
    String patientId;

    @BeforeEach
    void setUp() throws Exception {
        token = registerClinic(mvc, "Clínica Agenda");
        // El administrador que registra la clínica queda como profesional.
        dentistId = JsonPath.read(getJson("/api/professionals"), "$[0].id");
        siteId = JsonPath.read(getJson("/api/sites"), "$[0].id");
        patientId = createPatient(token, "40000001");
    }

    @Test
    void createAndListInRange() throws Exception {
        create(MONDAY_9, 30).andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("SCHEDULED"))
                .andExpect(jsonPath("$.startsAt").value(MONDAY_9.toString().replace("09:00", "09:00:00")))
                .andExpect(jsonPath("$.patient.fullName").value("Paciente Agenda"));

        mvc.perform(get("/api/appointments").header("Authorization", bearer(token))
                        .param("from", MONDAY_9.withHour(0).toString())
                        .param("to", MONDAY_9.plusDays(1).withHour(0).toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void overlapIsRejectedButCancelledFreesTheSlot() throws Exception {
        String id = JsonPath.read(create(MONDAY_9, 60).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "$.id");

        create(MONDAY_9.plusMinutes(30), 30).andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("El profesional ya tiene una cita en ese horario"));
        // Justo al terminar la anterior sí se puede (rango semiabierto).
        create(MONDAY_9.plusMinutes(60), 30).andExpect(status().isCreated());

        changeStatus(id, "CANCELLED", "Paciente reprograma").andExpect(status().isOk())
                .andExpect(jsonPath("$.cancellationReason").value("Paciente reprograma"));
        create(MONDAY_9.plusMinutes(15), 30).andExpect(status().isCreated());
    }

    @Test
    void concurrentBookingsOnlyOneWins() throws Exception {
        String patient2 = createPatient(token, "40000002");
        Callable<Integer> a = () -> create(MONDAY_9.plusHours(3), 30).andReturn().getResponse().getStatus();
        Callable<Integer> b = () -> createFor(patient2, MONDAY_9.plusHours(3), 30).andReturn().getResponse().getStatus();
        try (var pool = Executors.newFixedThreadPool(2)) {
            var results = new ArrayList<Integer>();
            for (var f : pool.invokeAll(java.util.List.of(a, b))) results.add(f.get());
            assertThat(results).containsExactlyInAnyOrder(201, 409);
        }
    }

    @Test
    void scheduleRestrictsBookings() throws Exception {
        mvc.perform(put("/api/schedules/" + dentistId).header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"blocks":[{"siteId":"%s","dayOfWeek":1,"startTime":"08:00","endTime":"12:00"}]}"""
                                .formatted(siteId)))
                .andExpect(status().isOk());

        create(MONDAY_9, 30).andExpect(status().isCreated());
        create(MONDAY_9.plusHours(3).plusMinutes(30), 60).andExpect(status().isBadRequest()) // 12:30, fuera
                .andExpect(jsonPath("$.detail").value("Fuera del horario de atención del profesional en esa sede"));
        create(MONDAY_9.plusDays(1), 30).andExpect(status().isBadRequest()); // martes sin horario
    }

    @Test
    void overlappingScheduleBlocksAreRejected() throws Exception {
        mvc.perform(put("/api/schedules/" + dentistId).header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"blocks":[{"siteId":"%1$s","dayOfWeek":1,"startTime":"08:00","endTime":"12:00"},
                                           {"siteId":"%1$s","dayOfWeek":1,"startTime":"11:00","endTime":"14:00"}]}"""
                                .formatted(siteId)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void statusRules() throws Exception {
        String id = JsonPath.read(create(MONDAY_9, 30).andReturn().getResponse().getContentAsString(), "$.id");
        // Una cita futura no puede marcarse como atendida.
        changeStatus(id, "ATTENDED", null).andExpect(status().isBadRequest());
        changeStatus(id, "CONFIRMED", null).andExpect(status().isOk());
        changeStatus(id, "CANCELLED", null).andExpect(status().isOk());
        // Cancelada es final: no se reabre ni se reprograma.
        changeStatus(id, "CONFIRMED", null).andExpect(status().isConflict());
        mvc.perform(put("/api/appointments/" + id).header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content(body(patientId, MONDAY_9.plusHours(1), 30)))
                .andExpect(status().isConflict());
    }

    @Test
    void rescheduleMovesTheAppointment() throws Exception {
        String id = JsonPath.read(create(MONDAY_9, 30).andReturn().getResponse().getContentAsString(), "$.id");
        mvc.perform(put("/api/appointments/" + id).header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content(body(patientId, MONDAY_9.plusHours(2), 45)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.endsAt").value(MONDAY_9.plusHours(2).plusMinutes(45).toString().replace(":45", ":45:00")));
        // El horario viejo quedó libre (y reprogramar no choca consigo misma).
        create(MONDAY_9, 30).andExpect(status().isCreated());
    }

    @Test
    void otherClinicCannotSeeOrBookWithForeignIds() throws Exception {
        String id = JsonPath.read(create(MONDAY_9, 30).andReturn().getResponse().getContentAsString(), "$.id");
        String other = registerClinic(mvc, "Otra clínica");

        mvc.perform(get("/api/appointments/" + id).header("Authorization", bearer(other)))
                .andExpect(status().isNotFound());
        // Usar el paciente/profesional/sede de otra clínica no funciona.
        mvc.perform(post("/api/appointments").header("Authorization", bearer(other))
                        .contentType(MediaType.APPLICATION_JSON).content(body(patientId, MONDAY_9.plusHours(4), 30)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void patientAppointmentsAndValidation() throws Exception {
        create(MONDAY_9, 30).andExpect(status().isCreated());
        mvc.perform(get("/api/patients/" + patientId + "/appointments").header("Authorization", bearer(token)))
                .andExpect(jsonPath("$.length()").value(1));
        create(MONDAY_9.plusHours(5), 2).andExpect(status().isBadRequest()); // duración mínima 5 min
    }

    // ---------- helpers ----------

    private org.springframework.test.web.servlet.ResultActions create(OffsetDateTime start, int minutes) throws Exception {
        return createFor(patientId, start, minutes);
    }

    private org.springframework.test.web.servlet.ResultActions createFor(String patient, OffsetDateTime start, int minutes)
            throws Exception {
        return mvc.perform(post("/api/appointments").header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON).content(body(patient, start, minutes)));
    }

    private org.springframework.test.web.servlet.ResultActions changeStatus(String id, String status, String reason)
            throws Exception {
        String json = reason == null ? "{\"status\":\"%s\"}".formatted(status)
                : "{\"status\":\"%s\",\"cancellationReason\":\"%s\"}".formatted(status, reason);
        return mvc.perform(patch("/api/appointments/" + id + "/status").header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private String body(String patient, OffsetDateTime start, int minutes) {
        return """
                {"patientId":"%s","dentistId":"%s","siteId":"%s","startsAt":"%s","durationMinutes":%d,"reason":"Control"}"""
                .formatted(patient, dentistId, siteId, start, minutes);
    }

    private String getJson(String path) throws Exception {
        return mvc.perform(get(path).header("Authorization", bearer(token))).andReturn().getResponse().getContentAsString();
    }

    private String createPatient(String token, String doc) throws Exception {
        String json = """
                {"documentType":"CC","documentNumber":"%s","firstName":"Paciente","firstLastName":"Agenda",
                 "birthDate":"1990-01-01","sex":"H","regime":"CONTRIBUTIVO"}""".formatted(doc);
        return JsonPath.read(mvc.perform(post("/api/patients").header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
    }
}
