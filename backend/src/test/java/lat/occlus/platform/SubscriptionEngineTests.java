package lat.occlus.platform;

import static lat.occlus.support.ApiClient.bearer;
import static lat.occlus.support.PlatformTestSupport.createClient;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import lat.occlus.TestcontainersConfiguration;
import lat.occlus.shared.tenant.TenantContext;
import lat.occlus.support.PlatformTestSupport;
import lat.occlus.support.PlatformTestSupport.Client;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * El ciclo de vida de las suscripciones. El tiempo se simula de dos maneras: pasando un {@code now}
 * futuro al motor, y moviendo fechas en la BD cuando hay que probar el control de acceso (que usa
 * el reloj real).
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class SubscriptionEngineTests {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder encoder;
    @Autowired SubscriptionEngine engine;

    String platform;

    @BeforeEach
    void setUp() throws Exception {
        platform = PlatformTestSupport.loginPlatformAdmin(mvc, jdbc, encoder);
    }

    // ---------- Avisos ----------

    @Test
    void trialEndingNoticeIsSentOnceNoMatterHowManyTimesTheEngineRuns() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 14, null, null);
        sql("update clinic_subscription set trial_ends_at = ? where clinic_id = ?", ts(Instant.now().plus(Duration.ofDays(2))), c.clinicId());

        engine.run(Instant.now());
        engine.run(Instant.now());
        engine.run(Instant.now().plus(Duration.ofHours(5)));

        assertThat(events(c, "TRIAL_ENDING")).isEqualTo(1);
        assertThat(count("select count(*) from platform_notification n join platform_event e on e.id = n.event_id "
                + "where e.clinic_id = ? and e.kind = 'TRIAL_ENDING'", c.clinicId())).isEqualTo(1);
        // Una prueba que aún no termina conserva el acceso.
        call(get("/api/patients"), c.token()).andExpect(status().isOk());
    }

    // ---------- El acceso lo deciden las fechas, no el proceso ----------

    @Test
    void accessEndsByDatesEvenIfTheEngineNeverRuns() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 14, null, null);

        // Prueba vencida hace un día: dentro de los 7 días de gracia sigue pudiendo trabajar.
        sql("update clinic_subscription set trial_ends_at = ? where clinic_id = ?", ts(Instant.now().minus(Duration.ofDays(1))), c.clinicId());
        call(get("/api/patients"), c.token()).andExpect(status().isOk());
        call(get("/api/auth/me"), c.token()).andExpect(jsonPath("$.subscription.inGrace").value(true));

        // Pasada la gracia se bloquea, sin que nadie haya suspendido nada.
        sql("update clinic_subscription set trial_ends_at = ? where clinic_id = ?", ts(Instant.now().minus(Duration.ofDays(8))), c.clinicId());
        call(get("/api/patients"), c.token()).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("SUBSCRIPTION_INACTIVE"));
        assertThat(string("select status from clinic_subscription where clinic_id = ?", c.clinicId())).isEqualTo("TRIAL");
    }

    // ---------- Cobro automático ----------

    @Test
    void renewalIsChargedThroughTheGatewayExactlyOnce() throws Exception {
        Client c = clientWithCard("tok_visa_ok");
        sql("update clinic_subscription set trial_ends_at = ? where clinic_id = ?", ts(Instant.now().minus(Duration.ofHours(2))), c.clinicId());

        var first = engine.run(Instant.now());
        assertThat(first.paid()).isGreaterThanOrEqualTo(1);
        var charges = rows("select status, method, amount, period_end from subscription_charge where clinic_id = ?", c.clinicId());
        assertThat(charges).hasSize(1);
        assertThat(charges.getFirst().get("status")).isEqualTo("PAID");
        assertThat(charges.getFirst().get("method")).isEqualTo("GATEWAY");
        assertThat(string("select status from clinic_subscription where clinic_id = ?", c.clinicId())).isEqualTo("ACTIVE");
        assertThat(instant("select current_period_end from clinic_subscription where clinic_id = ?", c.clinicId()))
                .isAfter(Instant.now().plus(Duration.ofDays(25)));

        // Correr el motor otra vez (o desde otra instancia) no cobra de nuevo.
        engine.run(Instant.now());
        engine.run(Instant.now().plus(Duration.ofDays(1)));
        assertThat(count("select count(*) from subscription_charge where clinic_id = ?", c.clinicId())).isEqualTo(1);
        call(get("/api/patients"), c.token()).andExpect(status().isOk());
    }

    @Test
    void twoEnginesRunningAtTheSameTimeDoNotChargeTwice() throws Exception {
        Client c = clientWithCard("tok_visa_ok");
        sql("update clinic_subscription set trial_ends_at = ? where clinic_id = ?", ts(Instant.now().minus(Duration.ofHours(2))), c.clinicId());

        var pool = Executors.newFixedThreadPool(4);
        try {
            List<Callable<Object>> tasks = java.util.stream.Stream.<Callable<Object>>generate(() -> () -> engine.run(Instant.now())).limit(4).toList();
            for (var f : pool.invokeAll(tasks)) f.get();
        } finally {
            pool.shutdown();
        }
        assertThat(count("select count(*) from subscription_charge where clinic_id = ?", c.clinicId())).isEqualTo(1);
        assertThat(count("select count(*) from subscription_charge where clinic_id = ? and status = 'PAID'", c.clinicId())).isEqualTo(1);
        assertThat(events(c, "PAYMENT_RECEIVED")).isEqualTo(1);
    }

    @Test
    void failedChargesAreRetriedWithBackoffThenTheClinicIsSuspendedAndManualPaymentRestoresIt() throws Exception {
        Client c = clientWithCard("tok_fail_declined");
        Instant due = Instant.now().minus(Duration.ofHours(1));
        sql("update clinic_subscription set trial_ends_at = ? where clinic_id = ?", ts(due), c.clinicId());

        // Intento 1: rechazado; queda en mora pero con acceso (gracia) y se reintenta en 1 día.
        var run1 = engine.run(Instant.now());
        assertThat(run1.failed()).isGreaterThanOrEqualTo(1);
        assertThat(string("select status from clinic_subscription where clinic_id = ?", c.clinicId())).isEqualTo("PAST_DUE");
        assertThat(count("select attempts from subscription_charge where clinic_id = ?", c.clinicId())).isEqualTo(1);
        assertThat(events(c, "PAYMENT_FAILED")).isEqualTo(1);
        call(get("/api/patients"), c.token()).andExpect(status().isOk());

        // Volver a correr enseguida no insiste.
        engine.run(Instant.now().plus(Duration.ofHours(3)));
        assertThat(count("select attempts from subscription_charge where clinic_id = ?", c.clinicId())).isEqualTo(1);

        // Un día después: segundo intento. Tres días más tarde: tercero.
        engine.run(Instant.now().plus(Duration.ofDays(1)).plus(Duration.ofMinutes(5)));
        assertThat(count("select attempts from subscription_charge where clinic_id = ?", c.clinicId())).isEqualTo(2);
        engine.run(Instant.now().plus(Duration.ofDays(4)).plus(Duration.ofMinutes(10)));
        assertThat(count("select attempts from subscription_charge where clinic_id = ?", c.clinicId())).isEqualTo(3);
        assertThat(events(c, "PAYMENT_FAILED")).isEqualTo(3);

        // Vencida la gracia (7 días desde que venció): se suspende y deja de cobrarse.
        engine.run(Instant.now().plus(Duration.ofDays(9)));
        assertThat(string("select status from clinic_subscription where clinic_id = ?", c.clinicId())).isEqualTo("SUSPENDED");
        assertThat(events(c, "SUSPENDED")).isEqualTo(1);
        engine.run(Instant.now().plus(Duration.ofDays(20)));
        assertThat(count("select attempts from subscription_charge where clinic_id = ?", c.clinicId())).isEqualTo(3);
        assertThat(events(c, "SUSPENDED")).isEqualTo(1);

        // Con las fechas ya vencidas de verdad, la clínica no puede entrar.
        sql("update clinic_subscription set trial_ends_at = ?, past_due_since = ? where clinic_id = ?",
                ts(Instant.now().minus(Duration.ofDays(12))), ts(Instant.now().minus(Duration.ofDays(12))), c.clinicId());
        call(get("/api/patients"), c.token()).andExpect(status().isForbidden());

        // El administrador registra la transferencia: el periodo empieza HOY (no se cobra lo que no pudo usar).
        call(post("/api/platform/clinics/" + c.clinicId() + "/payments").contentType(MediaType.APPLICATION_JSON)
                .content("{\"reference\":\"TRF-98765\"}"), platform).andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PAID")).andExpect(jsonPath("$.method").value("MANUAL"));
        assertThat(string("select status from clinic_subscription where clinic_id = ?", c.clinicId())).isEqualTo("ACTIVE");
        Instant start = instant("select current_period_start from clinic_subscription where clinic_id = ?", c.clinicId());
        assertThat(Duration.between(start, Instant.now()).abs()).isLessThan(Duration.ofMinutes(2));
        call(get("/api/patients"), c.token()).andExpect(status().isOk());
        assertThat(count("select count(*) from subscription_charge where clinic_id = ?", c.clinicId())).isEqualTo(1);
        // Pagar dos veces el mismo cobro no genera otro.
        call(post("/api/platform/clinics/" + c.clinicId() + "/payments").contentType(MediaType.APPLICATION_JSON)
                .content("{\"reference\":\"TRF-98765\"}"), platform).andExpect(status().isConflict());
        assertThat(count("select count(*) from subscription_charge where clinic_id = ? and status = 'PAID'", c.clinicId()))
                .isGreaterThanOrEqualTo(1);
    }

    @Test
    void withoutACardTheRenewalWaitsForAManualPaymentAndWarnsTheTeam() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 14, null, null); // sin tarjeta
        sql("update clinic_subscription set trial_ends_at = ? where clinic_id = ?", ts(Instant.now().minus(Duration.ofHours(1))), c.clinicId());

        var run = engine.run(Instant.now());
        assertThat(run.attempts()).isZero(); // sin medio de pago no hay nada que intentar con la pasarela
        assertThat(events(c, "TRIAL_ENDED")).isEqualTo(1);
        assertThat(string("select status from clinic_subscription where clinic_id = ?", c.clinicId())).isEqualTo("PAST_DUE");
        assertThat(string("select severity from platform_event where clinic_id = ? and kind = 'TRIAL_ENDED'", c.clinicId())).isEqualTo("WARNING");
        call(post("/api/platform/clinics/" + c.clinicId() + "/payments").contentType(MediaType.APPLICATION_JSON)
                .content("{\"reference\":\"CONSIG-1\"}"), platform).andExpect(status().isCreated());
        assertThat(string("select status from clinic_subscription where clinic_id = ?", c.clinicId())).isEqualTo("ACTIVE");
    }

    // ---------- Cancelación ----------

    @Test
    void cancelAtPeriodEndKeepsAccessUntilThenEndsExactlyOnTime() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 0, null, null); // ACTIVA con el primer pago
        call(post("/api/platform/clinics/" + c.clinicId() + "/subscription/cancel").contentType(MediaType.APPLICATION_JSON)
                .content("{\"immediately\":false,\"reason\":\"Se muda de ciudad\"}"), platform)
                .andExpect(status().isOk()).andExpect(jsonPath("$.cancelAtPeriodEnd").value(true))
                .andExpect(jsonPath("$.status").value("ACTIVE"));
        call(get("/api/patients"), c.token()).andExpect(status().isOk());

        // Arrepentirse a tiempo: la cancelación programada se puede deshacer, y volver a programar.
        call(post("/api/platform/clinics/" + c.clinicId() + "/subscription/resume"), platform)
                .andExpect(status().isOk()).andExpect(jsonPath("$.cancelAtPeriodEnd").value(false));
        call(post("/api/platform/clinics/" + c.clinicId() + "/subscription/cancel").contentType(MediaType.APPLICATION_JSON)
                .content("{\"immediately\":false,\"reason\":\"Insiste en cancelar\"}"), platform).andExpect(status().isOk());

        // Llega el fin del periodo: sin gracia (canceló), se cierra aunque el motor no haya corrido.
        sql("update clinic_subscription set current_period_end = ? where clinic_id = ?", ts(Instant.now().minus(Duration.ofMinutes(1))), c.clinicId());
        call(get("/api/patients"), c.token()).andExpect(status().isForbidden());
        engine.run(Instant.now());
        assertThat(string("select status from clinic_subscription where clinic_id = ?", c.clinicId())).isEqualTo("CANCELLED");
        assertThat(events(c, "SUBSCRIPTION_CANCELLED")).isEqualTo(1);
        assertThat(count("select count(*) from subscription_charge where clinic_id = ? and status <> 'PAID'", c.clinicId())).isZero();

        // Una cancelada no se cobra sola ni se "reactiva" con un pago: primero se reanuda.
        call(post("/api/platform/clinics/" + c.clinicId() + "/payments").contentType(MediaType.APPLICATION_JSON)
                .content("{\"reference\":\"TRF-1\"}"), platform).andExpect(status().isConflict());
    }

    @Test
    void cancelImmediatelyBlocksAtOnceAndCanBeResumed() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 14, null, null);
        call(post("/api/platform/clinics/" + c.clinicId() + "/subscription/cancel").contentType(MediaType.APPLICATION_JSON)
                .content("{\"immediately\":true,\"reason\":\"Cierre de la clínica\"}"), platform)
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CANCELLED"));
        call(get("/api/patients"), c.token()).andExpect(status().isForbidden());
        call(get("/api/auth/me"), c.token()).andExpect(jsonPath("$.subscription.inactiveMessage")
                .value(org.hamcrest.Matchers.containsString("cancelada")));

        // «Reanudar» solo deshace una cancelación programada; para volver de una efectiva se reactiva.
        call(post("/api/platform/clinics/" + c.clinicId() + "/subscription/resume"), platform).andExpect(status().isConflict());
        call(post("/api/platform/clinics/" + c.clinicId() + "/subscription/reactivate").contentType(MediaType.APPLICATION_JSON)
                .content("{\"courtesyDays\":15,\"reason\":\"Volvió con nosotros\"}"), platform).andExpect(status().isOk());
        call(get("/api/patients"), c.token()).andExpect(status().isOk());
    }

    @Test
    void extendingATrialMovesTheDeadlineAndIsAudited() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 3, null, null);
        Instant before = instant("select trial_ends_at from clinic_subscription where clinic_id = ?", c.clinicId());
        call(post("/api/platform/clinics/" + c.clinicId() + "/subscription/extend-trial").contentType(MediaType.APPLICATION_JSON)
                .content("{\"days\":10,\"reason\":\"Aún no termina la capacitación\"}"), platform).andExpect(status().isOk());
        Instant after = instant("select trial_ends_at from clinic_subscription where clinic_id = ?", c.clinicId());
        assertThat(Duration.between(before, after)).isEqualTo(Duration.ofDays(10));
        call(get("/api/platform/audit").param("clinicId", c.clinicId().toString()).param("action", "TRIAL_EXTENDED"), platform)
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void paymentMethodIsStoredAsATokenOnly() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 14, null, null);
        call(put("/api/platform/clinics/" + c.clinicId() + "/payment-method").contentType(MediaType.APPLICATION_JSON)
                .content("{\"tokenRef\":\"tok_abc123\",\"label\":\"Visa ···· 4242\"}"), platform).andExpect(status().isNoContent());
        String detail = call(get("/api/platform/clinics/" + c.clinicId()), platform).andExpect(status().isOk())
                .andExpect(jsonPath("$.paymentMethod.label").value("Visa ···· 4242"))
                .andReturn().getResponse().getContentAsString();
        // El token de la pasarela nunca vuelve al navegador.
        assertThat(detail).doesNotContain("tok_abc123");
        call(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/platform/clinics/" + c.clinicId() + "/payment-method"),
                platform).andExpect(status().isNoContent());
        call(get("/api/platform/clinics/" + c.clinicId()), platform).andExpect(jsonPath("$.paymentMethod").doesNotExist());
    }

    // ---------- helpers ----------

    private Client clientWithCard(String token) throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 14, null, null);
        call(put("/api/platform/clinics/" + c.clinicId() + "/payment-method").contentType(MediaType.APPLICATION_JSON)
                .content("{\"tokenRef\":\"%s\",\"label\":\"Tarjeta de prueba\"}".formatted(token)), platform)
                .andExpect(status().isNoContent());
        return c;
    }

    private ResultActions call(MockHttpServletRequestBuilder req, String token) throws Exception {
        return mvc.perform(req.header("Authorization", bearer(token)));
    }

    private static Timestamp ts(Instant i) {
        return Timestamp.from(i);
    }

    private void sql(String sql, Object... args) {
        TenantContext.callAsSystem(() -> jdbc.update(sql, args));
    }

    private long count(String sql, Object... args) {
        return TenantContext.callAsSystem(() -> ((Number) jdbc.queryForObject(sql, Object.class, args)).longValue());
    }

    private long events(Client c, String kind) {
        return count("select count(*) from platform_event where clinic_id = ? and kind = '" + kind + "'", c.clinicId());
    }

    private String string(String sql, Object... args) {
        return TenantContext.callAsSystem(() -> jdbc.queryForObject(sql, String.class, args));
    }

    private Instant instant(String sql, Object... args) {
        return TenantContext.callAsSystem(() -> jdbc.queryForObject(sql, Timestamp.class, args).toInstant());
    }

    private List<java.util.Map<String, Object>> rows(String sql, Object... args) {
        return TenantContext.callAsSystem(() -> jdbc.queryForList(sql, args));
    }
}
