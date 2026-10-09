package lat.occlus.platform;

import static lat.occlus.support.ApiClient.bearer;
import static lat.occlus.support.ApiClient.createUserAndLogin;
import static lat.occlus.support.PlatformTestSupport.createClient;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import lat.occlus.TestcontainersConfiguration;
import lat.occlus.shared.tenant.TenantContext;
import lat.occlus.support.FakeGatewayServer;
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
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * Pagos por Wompi y ePayco contra servidores simulados. Lo que se prueba: firmas, que nada se
 * aplique sin confirmar con la pasarela, idempotencia, y que una clínica suspendida pueda pagar.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class PaymentGatewayTests {

    static final FakeGatewayServer FAKE = new FakeGatewayServer();
    static final String EVENTS_SECRET = "test_events_secreto";
    static final String INTEGRITY_SECRET = "test_integrity_secreto";
    static final String EPAYCO_CUSTOMER = "4321";
    static final String EPAYCO_PKEY = "p_key_secreta";

    @DynamicPropertySource
    static void gateways(DynamicPropertyRegistry r) {
        r.add("occlus.payments.public-url", () -> "https://occlus.test");
        r.add("occlus.payments.wompi.enabled", () -> "true");
        r.add("occlus.payments.wompi.environment", () -> "sandbox");
        r.add("occlus.payments.wompi.public-key", () -> "pub_test_abc");
        r.add("occlus.payments.wompi.private-key", () -> "prv_test_abc");
        r.add("occlus.payments.wompi.events-secret", () -> EVENTS_SECRET);
        r.add("occlus.payments.wompi.integrity-secret", () -> INTEGRITY_SECRET);
        r.add("occlus.payments.wompi.base-url", () -> FAKE.baseUrl() + "/v1");
        r.add("occlus.payments.epayco.enabled", () -> "true");
        r.add("occlus.payments.epayco.customer-id", () -> EPAYCO_CUSTOMER);
        r.add("occlus.payments.epayco.public-key", () -> "epayco_pub");
        r.add("occlus.payments.epayco.p-key", () -> EPAYCO_PKEY);
        r.add("occlus.payments.epayco.validation-url", () -> FAKE.baseUrl() + "/validation");
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder encoder;
    @Autowired SubscriptionEngine engine;

    String platform;

    @BeforeEach
    void setUp() throws Exception {
        platform = PlatformTestSupport.loginPlatformAdmin(mvc, jdbc, encoder);
        FAKE.postStatus = "APPROVED";
        FAKE.postFlipAfterGets = -1;
    }

    // ---------- Iniciar un pago ----------

    @Test
    void wompiCheckoutUrlCarriesTheIntegritySignatureAndOnlyAdminsCanStartIt() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 14, null, null);
        String body = start(c, "WOMPI").andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String url = JsonPath.read(body, "$.redirectUrl");
        String checkoutId = JsonPath.read(body, "$.checkoutId");

        var q = UriComponentsBuilder.fromUriString(url).build().getQueryParams();
        assertThat(url).startsWith("https://checkout.wompi.co/p/?");
        String reference = q.getFirst("reference");
        assertThat(reference).isEqualTo("occ-" + checkoutId);
        assertThat(q.getFirst("public-key")).isEqualTo("pub_test_abc");
        assertThat(q.getFirst("amount-in-cents")).isEqualTo("9900000");
        assertThat(q.getFirst("currency")).isEqualTo("COP");
        assertThat(q.getFirst("signature:integrity")).isEqualTo(Hashing.sha256Hex(reference + "9900000COP" + INTEGRITY_SECRET));
        assertThat(java.net.URLDecoder.decode(q.getFirst("redirect-url"), java.nio.charset.StandardCharsets.UTF_8))
                .isEqualTo("https://occlus.test/pago?c=" + checkoutId);
        // Las llaves privadas no viajan en la URL.
        assertThat(url).doesNotContain("prv_test").doesNotContain(INTEGRITY_SECRET).doesNotContain(EVENTS_SECRET);

        // Solo el administrador de la clínica; un proveedor inexistente o apagado se rechaza.
        String reception = createUserAndLogin(mvc, c.token(), "RECEPTION", false);
        call(post("/api/subscription/checkout").contentType(MediaType.APPLICATION_JSON).content("{\"provider\":\"WOMPI\"}"), reception)
                .andExpect(status().isForbidden());
        start(c, "PAYPAL").andExpect(status().isBadRequest());
        mvc.perform(post("/api/subscription/checkout").contentType(MediaType.APPLICATION_JSON).content("{\"provider\":\"WOMPI\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void aTemporaryPasswordTokenCannotUseTheBillingEndpoints() throws Exception {
        String email = lat.occlus.support.ApiClient.uniqueEmail("temp");
        String created = call(post("/api/platform/clinics").contentType(MediaType.APPLICATION_JSON).content("""
                {"clinicName":"Clínica Temp","adminName":"X","adminEmail":"%s","planCode":"ESENCIAL","billingCycle":"MONTHLY","trialDays":14}"""
                .formatted(email)), platform).andReturn().getResponse().getContentAsString();
        String temp = PlatformTestSupport.login(mvc, email, JsonPath.read(created, "$.temporaryPassword"));
        call(get("/api/subscription"), temp).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PASSWORD_CHANGE_REQUIRED"));
        call(get("/api/platform/overview"), temp).andExpect(status().isForbidden());
        call(get("/api/auth/me"), temp).andExpect(status().isOk()); // lo mínimo para poder cambiarla
    }

    @Test
    void aSuspendedClinicCanStillSeeItsBillAndPayIt() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 14, null, null);
        call(post("/api/platform/clinics/" + c.clinicId() + "/subscription/suspend").contentType(MediaType.APPLICATION_JSON)
                .content("{\"reason\":\"Sin pago\"}"), platform).andExpect(status().isOk());
        call(get("/api/patients"), c.token()).andExpect(status().isForbidden());

        call(get("/api/subscription"), c.token()).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SUSPENDED")).andExpect(jsonPath("$.accessAllowed").value(false))
                .andExpect(jsonPath("$.canPay").value(true)).andExpect(jsonPath("$.price").value(99000))
                .andExpect(jsonPath("$.checkoutProviders").value(org.hamcrest.Matchers.hasItems("WOMPI", "EPAYCO")));

        String body = start(c, "WOMPI").andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(body, "$.checkoutId");
        FAKE.putWompi("tx-susp", "APPROVED", 9_900_000, "occ-" + id);
        call(post("/api/subscription/checkout/" + id + "/refresh").contentType(MediaType.APPLICATION_JSON).content("{}"), c.token())
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("APPROVED"));

        // Pagó: vuelve a tener acceso con la misma sesión, y el periodo empieza hoy.
        call(get("/api/patients"), c.token()).andExpect(status().isOk());
        assertThat(string("select status from clinic_subscription where clinic_id = ?", c.clinicId())).isEqualTo("ACTIVE");
        assertThat(Duration.between(instant("select current_period_start from clinic_subscription where clinic_id = ?", c.clinicId()), Instant.now()).abs())
                .isLessThan(Duration.ofMinutes(2));
    }

    @Test
    void payingWhileAdministrativelySuspendedWithTimeLeftReactivatesAndAddsTheNewPeriod() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 0, null, null); // activa, periodo de 30 días pagado
        Instant oldEnd = instant("select current_period_end from clinic_subscription where clinic_id = ?", c.clinicId());
        call(post("/api/platform/clinics/" + c.clinicId() + "/subscription/suspend").contentType(MediaType.APPLICATION_JSON)
                .content("{\"reason\":\"Revisión\"}"), platform).andExpect(status().isOk());
        call(get("/api/patients"), c.token()).andExpect(status().isForbidden());

        String id = JsonPath.read(start(c, "WOMPI").andReturn().getResponse().getContentAsString(), "$.checkoutId");
        FAKE.putWompi("tx-adv", "APPROVED", 9_900_000, "occ-" + id);
        call(post("/api/subscription/checkout/" + id + "/refresh").contentType(MediaType.APPLICATION_JSON).content("{}"), c.token())
                .andExpect(jsonPath("$.status").value("APPROVED"));

        // Cobrado => activo. El mes nuevo se suma al final del periodo que ya tenía pagado.
        call(get("/api/patients"), c.token()).andExpect(status().isOk());
        assertThat(string("select status from clinic_subscription where clinic_id = ?", c.clinicId())).isEqualTo("ACTIVE");
        assertThat(instant("select current_period_end from clinic_subscription where clinic_id = ?", c.clinicId())).isAfter(oldEnd.plus(Duration.ofDays(27)));
    }

    // ---------- Wompi: webhook ----------

    @Test
    void aSignedWompiWebhookSettlesTheChargeOnlyAfterConfirmingWithWompi_andIsIdempotent() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 14, null, null);
        String id = JsonPath.read(start(c, "WOMPI").andReturn().getResponse().getContentAsString(), "$.checkoutId");
        String reference = "occ-" + id;
        FAKE.putWompi("tx-ok-1", "APPROVED", 9_900_000, reference);

        wompiWebhook("tx-ok-1", "APPROVED", 9_900_000, reference, EVENTS_SECRET).andExpect(status().isOk());
        assertThat(string("select status from subscription_checkout where id = ?::uuid", id)).isEqualTo("APPROVED");
        assertThat(count("select count(*) from subscription_charge where clinic_id = ? and status = 'PAID' and method = 'GATEWAY' and provider_ref = 'tx-ok-1'", c.clinicId())).isEqualTo(1);
        assertThat(string("select status from clinic_subscription where clinic_id = ?", c.clinicId())).isEqualTo("ACTIVE");
        call(get("/api/subscription"), c.token()).andExpect(jsonPath("$.charges[0].status").value("PAID"));

        // Wompi reenvía el evento: nada cambia.
        wompiWebhook("tx-ok-1", "APPROVED", 9_900_000, reference, EVENTS_SECRET).andExpect(status().isOk());
        assertThat(count("select count(*) from subscription_charge where clinic_id = ?", c.clinicId())).isEqualTo(1);
        assertThat(events(c, "PAYMENT_RECEIVED")).isEqualTo(1);
        // Y el navegador que vuelve después ve el mismo resultado.
        call(post("/api/subscription/checkout/" + id + "/refresh").contentType(MediaType.APPLICATION_JSON).content("{}"), c.token())
                .andExpect(jsonPath("$.status").value("APPROVED"));
    }

    @Test
    void aWebhookWithABadChecksumIsRejectedAndChangesNothing() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 14, null, null);
        String id = JsonPath.read(start(c, "WOMPI").andReturn().getResponse().getContentAsString(), "$.checkoutId");
        String reference = "occ-" + id;
        FAKE.putWompi("tx-forged", "APPROVED", 9_900_000, reference); // aunque Wompi dijera que sí…

        wompiWebhook("tx-forged", "APPROVED", 9_900_000, reference, "secreto-equivocado").andExpect(status().isUnauthorized());
        mvc.perform(post("/api/webhooks/wompi").contentType(MediaType.APPLICATION_JSON).content("{\"event\":\"transaction.updated\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/webhooks/wompi").contentType(MediaType.APPLICATION_JSON).content("no es json")).andExpect(status().isUnauthorized());
        assertThat(string("select status from subscription_checkout where id = ?::uuid", id)).isEqualTo("CREATED");
        assertThat(count("select count(*) from subscription_charge where clinic_id = ? and status = 'PAID'", c.clinicId())).isZero();
    }

    @Test
    void aSignedWebhookCannotLieAboutTheAmountOrTheReference() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 14, null, null);
        String id = JsonPath.read(start(c, "WOMPI").andReturn().getResponse().getContentAsString(), "$.checkoutId");
        String reference = "occ-" + id;

        // Wompi dice que se pagaron $1.000 (no $99.000): no se aplica y se avisa al equipo.
        FAKE.putWompi("tx-cheap", "APPROVED", 100_000, reference);
        wompiWebhook("tx-cheap", "APPROVED", 9_900_000, reference, EVENTS_SECRET).andExpect(status().isOk());
        assertThat(count("select count(*) from subscription_charge where clinic_id = ? and status = 'PAID'", c.clinicId())).isZero();
        assertThat(events(c, "PAYMENT_REVIEW")).isEqualTo(1);

        // Una transacción aprobada de OTRA referencia no sirve para este cobro.
        FAKE.putWompi("tx-other", "APPROVED", 9_900_000, "occ-" + UUID.randomUUID());
        wompiWebhook("tx-other", "APPROVED", 9_900_000, reference, EVENTS_SECRET).andExpect(status().isOk());
        assertThat(count("select count(*) from subscription_charge where clinic_id = ? and status = 'PAID'", c.clinicId())).isZero();

        // Referencias que no son nuestras se ignoran sin error (Wompi no debe reintentar).
        FAKE.putWompi("tx-alien", "APPROVED", 5_000_000, "pedido-ajeno-9");
        wompiWebhook("tx-alien", "APPROVED", 5_000_000, "pedido-ajeno-9", EVENTS_SECRET).andExpect(status().isOk());
    }

    @Test
    void declinedPaymentsAreRecordedAndTheClinicCanTryAgain() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 14, null, null);
        String id = JsonPath.read(start(c, "WOMPI").andReturn().getResponse().getContentAsString(), "$.checkoutId");
        var tx = FAKE.putWompi("tx-declined", "DECLINED", 9_900_000, "occ-" + id);
        tx.message = "Fondos insuficientes";

        call(post("/api/subscription/checkout/" + id + "/refresh").contentType(MediaType.APPLICATION_JSON).content("{\"providerRef\":\"tx-declined\"}"), c.token())
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DECLINED"));
        assertThat(string("select failure_reason from subscription_checkout where id = ?::uuid", id)).contains("Fondos");
        assertThat(events(c, "PAYMENT_FAILED")).isEqualTo(1);
        assertThat(count("select count(*) from subscription_charge where clinic_id = ? and status = 'PAID'", c.clinicId())).isZero();
        // Nueva oportunidad: otro intento sobre el mismo cobro.
        start(c, "WOMPI").andExpect(status().isCreated());
        assertThat(count("select count(*) from subscription_charge where clinic_id = ?", c.clinicId())).isEqualTo(1);
    }

    @Test
    void anotherClinicCannotConfirmOrReadMyPayment() throws Exception {
        Client mine = createClient(mvc, platform, "ESENCIAL", 14, null, null);
        Client theirs = createClient(mvc, platform, "ESENCIAL", 14, null, null);
        String id = JsonPath.read(start(mine, "WOMPI").andReturn().getResponse().getContentAsString(), "$.checkoutId");
        call(post("/api/subscription/checkout/" + id + "/refresh").contentType(MediaType.APPLICATION_JSON).content("{}"), theirs.token())
                .andExpect(status().isNotFound());
        // Ni pagar con una transacción aprobada de otro cliente: la referencia no coincide.
        FAKE.putWompi("tx-theirs", "APPROVED", 9_900_000, "occ-" + UUID.randomUUID());
        call(post("/api/subscription/checkout/" + id + "/refresh").contentType(MediaType.APPLICATION_JSON).content("{\"providerRef\":\"tx-theirs\"}"), mine.token())
                .andExpect(jsonPath("$.status").value("CREATED"));
        assertThat(count("select count(*) from subscription_charge where clinic_id = ? and status = 'PAID'", mine.clinicId())).isZero();
    }

    @Test
    void aSecondApprovedPaymentForAnAlreadyPaidChargeIsFlaggedForRefund() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 14, null, null);
        String first = JsonPath.read(start(c, "WOMPI").andReturn().getResponse().getContentAsString(), "$.checkoutId");
        String second = JsonPath.read(start(c, "WOMPI").andReturn().getResponse().getContentAsString(), "$.checkoutId");
        FAKE.putWompi("tx-a", "APPROVED", 9_900_000, "occ-" + first);
        FAKE.putWompi("tx-b", "APPROVED", 9_900_000, "occ-" + second);
        wompiWebhook("tx-a", "APPROVED", 9_900_000, "occ-" + first, EVENTS_SECRET).andExpect(status().isOk());
        wompiWebhook("tx-b", "APPROVED", 9_900_000, "occ-" + second, EVENTS_SECRET).andExpect(status().isOk());

        assertThat(count("select count(*) from subscription_charge where clinic_id = ? and status = 'PAID'", c.clinicId())).isEqualTo(1);
        assertThat(events(c, "PAYMENT_REVIEW")).isEqualTo(1); // el equipo debe reembolsar la segunda
    }

    // ---------- Wompi: tarjeta guardada y cobro automático ----------

    @Test
    void theClinicSavesACardAndTheEngineChargesItThroughWompi() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 14, null, null);
        call(get("/api/subscription/wompi/setup"), c.token()).andExpect(status().isOk())
                .andExpect(jsonPath("$.publicKey").value("pub_test_abc")).andExpect(jsonPath("$.acceptanceToken").value("acc-tok"))
                .andExpect(jsonPath("$.personalAuthToken").value("pda-tok"));
        // El navegador tokeniza la tarjeta con Wompi; aquí solo llega el token.
        int before = FAKE.wompiPosts.size();
        call(put("/api/subscription/payment-method").contentType(MediaType.APPLICATION_JSON).content("""
                {"cardToken":"tok_test_1","acceptanceToken":"acc-tok","personalAuthToken":"pda-tok","label":"Visa ···· 4242"}"""), c.token())
                .andExpect(status().isNoContent());
        var source = FAKE.wompiPosts.get(before);
        assertThat(source.path("type").asString()).isEqualTo("CARD");
        assertThat(source.path("token").asString()).isEqualTo("tok_test_1");
        assertThat(source.path("customer_email").asString()).isEqualTo(c.adminEmail());
        assertThat(source.path("acceptance_token").asString()).isEqualTo("acc-tok");
        assertThat(source.path("accept_personal_auth").asString()).isEqualTo("pda-tok");
        call(get("/api/subscription"), c.token()).andExpect(jsonPath("$.paymentMethod.label").value("Visa ···· 4242"))
                .andExpect(jsonPath("$.paymentMethod.provider").value("WOMPI"));

        // Se acabó la prueba: el motor cobra la fuente de pago. Wompi nace PENDING y se aprueba en la siguiente consulta.
        sql("update clinic_subscription set trial_ends_at = ? where clinic_id = ?", Timestamp.from(Instant.now().minus(Duration.ofHours(1))), c.clinicId());
        FAKE.postStatus = "PENDING";
        FAKE.postFlipAfterGets = 1;
        FAKE.postFlipTo = "APPROVED";
        int posts = FAKE.wompiPosts.size();
        var run = engine.run(Instant.now());
        assertThat(run.paid()).isGreaterThanOrEqualTo(1);

        var charge = FAKE.wompiPosts.get(posts);
        UUID chargeId = UUID.fromString(string("select id::text from subscription_charge where clinic_id = ?", c.clinicId()));
        assertThat(charge.path("payment_source_id").asLong()).isEqualTo(777);
        assertThat(charge.path("amount_in_cents").asLong()).isEqualTo(9_900_000);
        assertThat(charge.path("currency").asString()).isEqualTo("COP");
        assertThat(charge.path("recurrent").asBoolean()).isTrue();
        assertThat(charge.path("customer_email").asString()).isEqualTo(c.adminEmail());
        String ref = charge.path("reference").asString();
        assertThat(ref).isEqualTo("sub-" + chargeId + "-1");
        assertThat(charge.path("signature").asString()).isEqualTo(Hashing.sha256Hex(ref + "9900000COP" + INTEGRITY_SECRET));
        assertThat(string("select status from subscription_charge where id = ?", chargeId)).isEqualTo("PAID");
        assertThat(string("select method from subscription_charge where id = ?", chargeId)).isEqualTo("GATEWAY");
        assertThat(string("select status from clinic_subscription where clinic_id = ?", c.clinicId())).isEqualTo("ACTIVE");

        // Quitar la tarjeta.
        call(delete("/api/subscription/payment-method"), c.token()).andExpect(status().isNoContent());
        call(get("/api/subscription"), c.token()).andExpect(jsonPath("$.paymentMethod").doesNotExist());
    }

    @Test
    void anAutomaticChargeThatWompiLeavesPendingIsSettledByItsWebhookLater() throws Exception {
        Client c = clientWithWompiSource();
        sql("update clinic_subscription set trial_ends_at = ? where clinic_id = ?", Timestamp.from(Instant.now().minus(Duration.ofHours(1))), c.clinicId());
        FAKE.postStatus = "PENDING"; // y nunca se resuelve durante la espera
        int posts = FAKE.wompiPosts.size();
        var run = engine.run(Instant.now());
        assertThat(run.paid()).isZero();
        String chargeStatus = string("select status from subscription_charge where clinic_id = ?", c.clinicId());
        assertThat(chargeStatus).isEqualTo("PENDING");
        assertThat(events(c, "PAYMENT_FAILED")).isZero(); // pendiente no es fallido

        String ref = FAKE.wompiPosts.get(posts).path("reference").asString();
        var tx = FAKE.byReference(ref);
        tx.status = "APPROVED"; // Wompi termina de procesarlo
        wompiWebhook(tx.id, "APPROVED", tx.cents, ref, EVENTS_SECRET).andExpect(status().isOk());
        assertThat(string("select status from subscription_charge where clinic_id = ?", c.clinicId())).isEqualTo("PAID");
        assertThat(string("select status from clinic_subscription where clinic_id = ?", c.clinicId())).isEqualTo("ACTIVE");
    }

    @Test
    void aDeclinedAutomaticChargeIsRetriedLaterAndFlagged() throws Exception {
        Client c = clientWithWompiSource();
        sql("update clinic_subscription set trial_ends_at = ? where clinic_id = ?", Timestamp.from(Instant.now().minus(Duration.ofHours(1))), c.clinicId());
        FAKE.postStatus = "DECLINED";
        var run = engine.run(Instant.now());
        assertThat(run.failed()).isGreaterThanOrEqualTo(1);
        assertThat(string("select failure_reason from subscription_charge where clinic_id = ?", c.clinicId())).contains("Fondos insuficientes");
        assertThat(events(c, "PAYMENT_FAILED")).isEqualTo(1);
        assertThat(count("select attempts from subscription_charge where clinic_id = ?", c.clinicId())).isEqualTo(1);
    }

    @Test
    void anOpenCheckoutPausesTheAutomaticCharge() throws Exception {
        Client c = clientWithWompiSource();
        sql("update clinic_subscription set trial_ends_at = ? where clinic_id = ?", Timestamp.from(Instant.now().minus(Duration.ofHours(1))), c.clinicId());
        start(c, "WOMPI").andExpect(status().isCreated()); // la persona está pagando en la página de Wompi
        int posts = FAKE.wompiPosts.size();
        engine.run(Instant.now());
        assertThat(FAKE.wompiPosts.size()).isEqualTo(posts); // el motor no cobra encima
    }

    // ---------- ePayco ----------

    @Test
    void epaycoCheckoutAndSignedConfirmationSettleTheCharge() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 14, null, null);
        String body = start(c, "EPAYCO").andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String id = JsonPath.read(body, "$.checkoutId");
        String reference = "occ-" + id;
        assertThat((String) JsonPath.read(body, "$.redirectUrl")).isNull();
        assertThat((String) JsonPath.read(body, "$.params.key")).isEqualTo("epayco_pub");
        assertThat((String) JsonPath.read(body, "$.params.invoice")).isEqualTo(reference);
        assertThat((String) JsonPath.read(body, "$.params.amount")).isEqualTo("99000");
        assertThat((String) JsonPath.read(body, "$.params.currency")).isEqualTo("cop");
        assertThat((String) JsonPath.read(body, "$.params.response")).isEqualTo("https://occlus.test/pago?c=" + id);
        assertThat((String) JsonPath.read(body, "$.params.confirmation")).isEqualTo("https://occlus.test/api/webhooks/epayco");
        assertThat((String) JsonPath.read(body, "$.params.extra1")).isEqualTo(id);
        assertThat(body).doesNotContain(EPAYCO_PKEY);

        // Firma inválida: 401.
        epaycoWebhook("REF-1", "TX-1", "99000", "COP", reference, "firma-falsa").andExpect(status().isUnauthorized());
        assertThat(string("select status from subscription_checkout where id = ?::uuid", id)).isEqualTo("CREATED");

        // Firma válida pero ePayco (consultado aparte) no la conoce o dice otra cosa: no se aplica.
        epaycoWebhook("REF-1", "TX-1", "99000", "COP", reference, epaycoSignature("REF-1", "TX-1", "99000", "COP")).andExpect(status().isOk());
        assertThat(string("select status from subscription_checkout where id = ?::uuid", id)).isEqualTo("CREATED");

        // ePayco confirma al consultarlo: se aplica.
        FAKE.epaycoData.put("REF-1", epaycoData("REF-1", "TX-1", "99000", "COP", reference, "1"));
        epaycoWebhook("REF-1", "TX-1", "99000", "COP", reference, epaycoSignature("REF-1", "TX-1", "99000", "COP")).andExpect(status().isOk());
        assertThat(string("select status from subscription_checkout where id = ?::uuid", id)).isEqualTo("APPROVED");
        assertThat(count("select count(*) from subscription_charge where clinic_id = ? and status = 'PAID' and provider_ref = 'REF-1'", c.clinicId())).isEqualTo(1);
        // Repetida: idempotente.
        epaycoWebhook("REF-1", "TX-1", "99000", "COP", reference, epaycoSignature("REF-1", "TX-1", "99000", "COP")).andExpect(status().isOk());
        assertThat(events(c, "PAYMENT_RECEIVED")).isEqualTo(1);
    }

    @Test
    void epaycoRejectedAndAmountMismatchAreNotApplied() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 14, null, null);
        String id = JsonPath.read(start(c, "EPAYCO").andReturn().getResponse().getContentAsString(), "$.checkoutId");
        String reference = "occ-" + id;

        FAKE.epaycoData.put("REF-NO", epaycoData("REF-NO", "TX-NO", "99000", "COP", reference, "2"));
        epaycoWebhook("REF-NO", "TX-NO", "99000", "COP", reference, epaycoSignature("REF-NO", "TX-NO", "99000", "COP")).andExpect(status().isOk());
        assertThat(string("select status from subscription_checkout where id = ?::uuid", id)).isEqualTo("DECLINED");

        String id2 = JsonPath.read(start(c, "EPAYCO").andReturn().getResponse().getContentAsString(), "$.checkoutId");
        FAKE.epaycoData.put("REF-LOW", epaycoData("REF-LOW", "TX-LOW", "1000", "COP", "occ-" + id2, "1"));
        epaycoWebhook("REF-LOW", "TX-LOW", "1000", "COP", "occ-" + id2, epaycoSignature("REF-LOW", "TX-LOW", "1000", "COP")).andExpect(status().isOk());
        assertThat(string("select status from subscription_checkout where id = ?::uuid", id2)).isEqualTo("CREATED");
        assertThat(events(c, "PAYMENT_REVIEW")).isEqualTo(1);
        assertThat(count("select count(*) from subscription_charge where clinic_id = ? and status = 'PAID'", c.clinicId())).isZero();
    }

    @Test
    void epaycoReturnWithItsReferenceConfirmsWithoutTheWebhook() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 14, null, null);
        String id = JsonPath.read(start(c, "EPAYCO").andReturn().getResponse().getContentAsString(), "$.checkoutId");
        FAKE.epaycoData.put("REF-RET", epaycoData("REF-RET", "TX-RET", "99000", "COP", "occ-" + id, "1"));
        call(post("/api/subscription/checkout/" + id + "/refresh").contentType(MediaType.APPLICATION_JSON).content("{\"providerRef\":\"REF-RET\"}"), c.token())
                .andExpect(jsonPath("$.status").value("APPROVED"));
        assertThat(string("select status from clinic_subscription where clinic_id = ?", c.clinicId())).isEqualTo("ACTIVE");
    }

    // ---------- Cuentas que no se cobran ----------

    @Test
    void internalAccountsCannotStartAPayment() throws Exception {
        call(post("/api/subscription/checkout").contentType(MediaType.APPLICATION_JSON).content("{\"provider\":\"WOMPI\"}"), platform)
                .andExpect(status().isConflict());
        call(get("/api/subscription"), platform).andExpect(jsonPath("$.canPay").value(false));
    }

    // ---------- helpers ----------

    private Client clientWithWompiSource() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 14, null, null);
        call(put("/api/platform/clinics/" + c.clinicId() + "/payment-method").contentType(MediaType.APPLICATION_JSON)
                .content("{\"provider\":\"WOMPI\",\"tokenRef\":\"777\",\"label\":\"Visa ···· 4242\"}"), platform).andExpect(status().isNoContent());
        return c;
    }

    private ResultActions start(Client c, String provider) throws Exception {
        return call(post("/api/subscription/checkout").contentType(MediaType.APPLICATION_JSON).content("{\"provider\":\"%s\"}".formatted(provider)), c.token());
    }

    private ResultActions call(MockHttpServletRequestBuilder req, String token) throws Exception {
        return mvc.perform(req.header("Authorization", bearer(token)));
    }

    private ResultActions wompiWebhook(String txId, String status, long cents, String reference, String secret) throws Exception {
        long ts = 1_700_000_000L;
        String checksum = Hashing.sha256Hex(txId + status + cents + ts + secret);
        String body = """
                {"event":"transaction.updated","data":{"transaction":{"id":"%s","status":"%s","amount_in_cents":%d,"reference":"%s","currency":"COP"}},
                 "environment":"test","signature":{"properties":["transaction.id","transaction.status","transaction.amount_in_cents"],"checksum":"%s"},
                 "timestamp":%d,"sent_at":"2026-10-09T12:00:00Z"}""".formatted(txId, status, cents, reference, checksum, ts);
        return mvc.perform(post("/api/webhooks/wompi").contentType(MediaType.APPLICATION_JSON).header("X-Event-Checksum", checksum).content(body));
    }

    private static String epaycoSignature(String ref, String tx, String amount, String currency) {
        return Hashing.sha256Hex(String.join("^", EPAYCO_CUSTOMER, EPAYCO_PKEY, ref, tx, amount, currency));
    }

    private ResultActions epaycoWebhook(String ref, String tx, String amount, String currency, String invoice, String signature) throws Exception {
        return mvc.perform(post("/api/webhooks/epayco").contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("x_ref_payco", ref).param("x_transaction_id", tx).param("x_amount", amount).param("x_currency_code", currency)
                .param("x_id_invoice", invoice).param("x_signature", signature).param("x_cod_response", "1"));
    }

    private static java.util.Map<String, Object> epaycoData(String ref, String tx, String amount, String currency, String invoice, String code) {
        return java.util.Map.of("x_ref_payco", ref, "x_transaction_id", tx, "x_amount", amount, "x_currency_code", currency,
                "x_id_invoice", invoice, "x_cod_response", code, "x_response", code.equals("1") ? "Aceptada" : "Rechazada",
                "x_signature", epaycoSignature(ref, tx, amount, currency));
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
}
