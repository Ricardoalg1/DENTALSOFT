package lat.occlus.platform;

import static lat.occlus.support.ApiClient.bearer;
import static lat.occlus.support.ApiClient.registerClinic;
import static lat.occlus.support.PlatformTestSupport.createClient;
import static lat.occlus.support.PlatformTestSupport.json;
import static lat.occlus.support.PlatformTestSupport.login;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import java.util.UUID;
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

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class PlatformAdminTests {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    PasswordEncoder encoder;

    String platform;

    @BeforeEach
    void setUp() throws Exception {
        platform = PlatformTestSupport.loginPlatformAdmin(mvc, jdbc, encoder);
    }

    // ---------- Acceso al panel ----------

    @Test
    void onlyPlatformAdminsReachThePanel() throws Exception {
        String clinicAdmin = registerClinic(mvc, "Clínica curiosa");
        call(get("/api/platform/overview"), clinicAdmin).andExpect(status().isForbidden());
        call(get("/api/platform/clinics"), clinicAdmin).andExpect(status().isForbidden());
        call(post("/api/platform/engine/run"), clinicAdmin).andExpect(status().isForbidden());
        mvc.perform(get("/api/platform/overview")).andExpect(status().isUnauthorized());
        call(get("/api/platform/overview"), platform).andExpect(status().isOk());
    }

    @Test
    void platformPanelNeverExposesClinicalData() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 14, null, null);
        String patient = createPatient(c.token(), "99100001");
        String detail = call(get("/api/platform/clinics/" + c.clinicId()), platform).andExpect(status().isOk())
                .andExpect(jsonPath("$.usage.patients").value(1)).andReturn().getResponse().getContentAsString();
        // Solo el conteo: ni el nombre ni el documento del paciente aparecen en ningún dato del panel.
        assertThat(detail).doesNotContain("Paciente Prueba").doesNotContain("99100001").doesNotContain(patient);
    }

    // ---------- Alta de clientes ----------

    @Test
    void creatingAClientProvisionsEverythingAndForcesAPasswordChange() throws Exception {
        String email = lat.occlus.support.ApiClient.uniqueEmail("nuevo");
        String json = call(post("/api/platform/clinics").contentType(MediaType.APPLICATION_JSON).content("""
                {"clinicName":"Clínica Aurora","nit":"900123456","contactName":"Dra. Aurora","contactEmail":"aurora@example.com",
                 "city":"Medellín","adminName":"Laura Gómez","adminEmail":"%s","planCode":"EQUIPO","billingCycle":"ANNUAL",
                 "trialDays":14,"notes":"Llegó por referido"}""".formatted(email)), platform)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.adminEmail").value(email))
                .andReturn().getResponse().getContentAsString();
        String temp = JsonPath.read(json, "$.temporaryPassword");
        UUID clinicId = UUID.fromString(JsonPath.read(json, "$.clinicId"));
        assertThat(temp).matches("[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}");

        String tempToken = login(mvc, email, temp);
        call(get("/api/auth/me"), tempToken).andExpect(status().isOk())
                .andExpect(jsonPath("$.mustChangePassword").value(true))
                .andExpect(jsonPath("$.subscription.status").value("TRIAL"))
                .andExpect(jsonPath("$.subscription.planCode").value("EQUIPO"))
                .andExpect(jsonPath("$.platformAdmin").value(false))
                .andExpect(jsonPath("$.modules").value(org.hamcrest.Matchers.containsInAnyOrder(
                        "CLINICAL_RECORD", "TREATMENTS_CASH", "REPORTS")));
        // Con la contraseña temporal no se puede usar nada más, ni con otro rol del mismo token.
        call(get("/api/patients"), tempToken).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PASSWORD_CHANGE_REQUIRED"));

        // Cambiar la contraseña: la actual debe ser correcta (400, no 401: no cierra la sesión).
        call(post("/api/auth/change-password").contentType(MediaType.APPLICATION_JSON)
                .content("{\"currentPassword\":\"incorrecta\",\"newPassword\":\"Otra-clave-123\"}"), tempToken)
                .andExpect(status().isBadRequest());
        call(post("/api/auth/change-password").contentType(MediaType.APPLICATION_JSON)
                .content("{\"currentPassword\":\"%s\",\"newPassword\":\"%s\"}".formatted(temp, temp)), tempToken)
                .andExpect(status().isBadRequest());
        String newToken = PlatformTestSupport.changePassword(mvc, tempToken, temp, "Otra-clave-123");

        call(get("/api/patients"), newToken).andExpect(status().isOk());
        call(get("/api/patients"), tempToken).andExpect(status().isUnauthorized()); // cambiar la contraseña cierra la sesión anterior
        call(get("/api/auth/me"), newToken).andExpect(jsonPath("$.mustChangePassword").value(false));
        login(mvc, email, "Otra-clave-123");

        // Todo quedó creado: datos comerciales, suscripción y rastro.
        call(get("/api/platform/clinics/" + clinicId), platform)
                .andExpect(jsonPath("$.name").value("Clínica Aurora"))
                .andExpect(jsonPath("$.client.contactName").value("Dra. Aurora"))
                .andExpect(jsonPath("$.client.source").value("MANUAL"))
                .andExpect(jsonPath("$.subscription.billingCycle").value("ANNUAL"))
                .andExpect(jsonPath("$.subscription.price").value(1788000))
                .andExpect(jsonPath("$.subscription.maxUsers").value(10))
                .andExpect(jsonPath("$.usage.usersActive").value(1))
                .andExpect(jsonPath("$.admins[0].email").value(email));
        call(get("/api/platform/audit").param("clinicId", clinicId.toString()), platform)
                .andExpect(jsonPath("$.content[0].action").value("CLINIC_CREATED"))
                .andExpect(jsonPath("$.content[0].actorName").value("Equipo Occlus"));
        // El correo del administrador es único entre TODAS las clínicas.
        call(post("/api/platform/clinics").contentType(MediaType.APPLICATION_JSON).content("""
                {"clinicName":"Otra","adminName":"X","adminEmail":"%s","planCode":"ESENCIAL","billingCycle":"MONTHLY","trialDays":7}"""
                .formatted(email)), platform).andExpect(status().isConflict());
    }

    @Test
    void creationRulesAreValidated() throws Exception {
        String base = """
                {"clinicName":"X","adminName":"Y","adminEmail":"%s","billingCycle":"MONTHLY",%s}""";
        // Plan que se cotiza (Global): exige precio.
        call(post("/api/platform/clinics").contentType(MediaType.APPLICATION_JSON).content(base.formatted(
                lat.occlus.support.ApiClient.uniqueEmail("a"), "\"planCode\":\"GLOBAL\",\"trialDays\":7")), platform)
                .andExpect(status().isBadRequest());
        // Sin prueba hay que indicar el primer pago recibido.
        call(post("/api/platform/clinics").contentType(MediaType.APPLICATION_JSON).content(base.formatted(
                lat.occlus.support.ApiClient.uniqueEmail("b"), "\"planCode\":\"ESENCIAL\",\"trialDays\":0")), platform)
                .andExpect(status().isBadRequest());
        // Un módulo sin sus dependencias.
        call(post("/api/platform/clinics").contentType(MediaType.APPLICATION_JSON).content(base.formatted(
                lat.occlus.support.ApiClient.uniqueEmail("c"),
                "\"planCode\":\"ESENCIAL\",\"trialDays\":7,\"modules\":[\"BILLING_RIPS\"]")), platform)
                .andExpect(status().isBadRequest());
        // Plan inexistente.
        call(post("/api/platform/clinics").contentType(MediaType.APPLICATION_JSON).content(base.formatted(
                lat.occlus.support.ApiClient.uniqueEmail("d"), "\"planCode\":\"NOEXISTE\",\"trialDays\":7")), platform)
                .andExpect(status().isBadRequest());
        // Empezando con pago: queda activo y con el cobro registrado.
        Client paid = createClient(mvc, platform, "ESENCIAL", 0, null, null);
        call(get("/api/platform/clinics/" + paid.clinicId()), platform).andExpect(jsonPath("$.subscription.status").value("ACTIVE"));
        call(get("/api/platform/clinics/" + paid.clinicId() + "/charges"), platform)
                .andExpect(jsonPath("$[0].status").value("PAID")).andExpect(jsonPath("$[0].reference").value("TRF-0001"));
    }

    // ---------- Módulos: los decide el backend ----------

    @Test
    void modulesAreEnforcedByTheBackendOnEverySession() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 14, null, null); // clínica + tratamientos y caja
        String t = c.token();

        // Núcleo y módulos incluidos: funcionan.
        call(get("/api/patients"), t).andExpect(status().isOk());
        call(get("/api/procedures"), t).andExpect(status().isOk());
        call(get("/api/cash-sessions"), t).andExpect(status().isOk());
        // Módulos no incluidos: 403 con código legible, aunque el JWT sea válido y el usuario sea ADMIN.
        for (String path : List.of("/api/inventory", "/api/messaging", "/api/invoices", "/api/billing/profile")) {
            call(get(path), t).andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("MODULE_DISABLED"));
        }
        call(get("/api/reports").param("from", "2026-01-01").param("to", "2026-01-31"), t)
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.module").value("REPORTS"));
        // Escribir tampoco.
        call(post("/api/inventory/items").contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"X-1\",\"name\":\"Guantes\",\"unit\":\"caja\",\"minimum\":1,\"trackLots\":false,\"active\":true}"), t)
                .andExpect(status().isForbidden());

        // El administrador habilita Inventario: surte efecto en la MISMA sesión, sin volver a iniciar.
        setModules(c.clinicId(), "[\"CLINICAL_RECORD\",\"TREATMENTS_CASH\",\"INVENTORY\"]").andExpect(status().isOk());
        call(get("/api/inventory"), t).andExpect(status().isOk());
        call(get("/api/auth/me"), t).andExpect(jsonPath("$.modules").value(org.hamcrest.Matchers.hasItem("INVENTORY")));

        // Y lo quita: vuelve a bloquear al instante.
        setModules(c.clinicId(), "[\"CLINICAL_RECORD\",\"TREATMENTS_CASH\"]").andExpect(status().isOk());
        call(get("/api/inventory"), t).andExpect(status().isForbidden());

        // Quedó registrado quién lo hizo y qué cambió.
        call(get("/api/platform/audit").param("clinicId", c.clinicId().toString()).param("action", "MODULES_CHANGED"), platform)
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.content[0].details.removed[0]").value("INVENTORY"))
                .andExpect(jsonPath("$.content[1].details.added[0]").value("INVENTORY"));
    }

    @Test
    void moduleDependenciesAreValidated() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 14, null, null);
        // Facturación necesita historia clínica y tratamientos/caja.
        setModules(c.clinicId(), "[\"BILLING_RIPS\"]").andExpect(status().isBadRequest());
        // Reportes necesita tratamientos y caja: no se puede quitar dejándolo huérfano.
        setModules(c.clinicId(), "[\"CLINICAL_RECORD\",\"TREATMENTS_CASH\",\"REPORTS\"]").andExpect(status().isOk());
        setModules(c.clinicId(), "[\"CLINICAL_RECORD\",\"REPORTS\"]").andExpect(status().isBadRequest());
        // Un módulo que no existe.
        setModules(c.clinicId(), "[\"CRIPTOMONEDAS\"]").andExpect(status().isBadRequest());
        // Solo núcleo: es válido.
        setModules(c.clinicId(), "[]").andExpect(status().isOk());
        call(get("/api/patients"), c.token()).andExpect(status().isOk());
        call(get("/api/procedures"), c.token()).andExpect(status().isForbidden());
    }

    // ---------- Suscripción: suspender, reactivar, límites ----------

    @Test
    void suspensionCutsAccessImmediatelyEvenForExistingSessions() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 14, null, null);
        call(get("/api/patients"), c.token()).andExpect(status().isOk());

        call(post("/api/platform/clinics/" + c.clinicId() + "/subscription/suspend").contentType(MediaType.APPLICATION_JSON)
                .content("{\"reason\":\"Solicitud del cliente\"}"), platform).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SUSPENDED")).andExpect(jsonPath("$.accessAllowed").value(false));

        // La sesión que ya estaba abierta queda bloqueada al instante.
        call(get("/api/patients"), c.token()).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("SUBSCRIPTION_INACTIVE"));
        call(get("/api/procedures"), c.token()).andExpect(status().isForbidden());
        // Puede entrar y ver por qué (/me no depende de la suscripción), pero sin módulos.
        call(get("/api/auth/me"), c.token()).andExpect(status().isOk())
                .andExpect(jsonPath("$.subscription.accessAllowed").value(false))
                .andExpect(jsonPath("$.subscription.inactiveMessage").value(org.hamcrest.Matchers.containsString("suspendida")))
                .andExpect(jsonPath("$.modules").isEmpty());
        // Y también puede iniciar sesión de nuevo.
        login(mvc, c.adminEmail(), "Clave-definitiva-9");

        // Suspender dos veces no tiene sentido.
        call(post("/api/platform/clinics/" + c.clinicId() + "/subscription/suspend").contentType(MediaType.APPLICATION_JSON)
                .content("{\"reason\":\"otra vez\"}"), platform).andExpect(status().isConflict());

        // Reactivar por cortesía devuelve el acceso con la misma sesión.
        call(post("/api/platform/clinics/" + c.clinicId() + "/subscription/reactivate").contentType(MediaType.APPLICATION_JSON)
                .content("{\"courtesyDays\":5,\"reason\":\"Pagó por transferencia\"}"), platform)
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACTIVE"));
        call(get("/api/patients"), c.token()).andExpect(status().isOk());
        // Quien ya está al día no se "reactiva".
        call(post("/api/platform/clinics/" + c.clinicId() + "/subscription/reactivate").contentType(MediaType.APPLICATION_JSON)
                .content("{\"courtesyDays\":5,\"reason\":\"x x\"}"), platform).andExpect(status().isConflict());
    }

    @Test
    void userLimitOfThePlanIsEnforcedByTheBackend() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 14, 2, null); // 2 usuarios: el administrador + 1
        String second = newUser(c.token(), "RECEPTION").andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        newUser(c.token(), "ASSISTANT").andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("hasta 2 usuarios")));

        // Desactivar a uno libera el cupo; reactivarlo cuando ya no cabe falla.
        String secondId = JsonPath.read(second, "$.id");
        call(patchJson("/api/users/" + secondId, "{\"active\":false}"), c.token()).andExpect(status().isOk());
        newUser(c.token(), "ASSISTANT").andExpect(status().isCreated());
        call(patchJson("/api/users/" + secondId, "{\"active\":true}"), c.token()).andExpect(status().isConflict());

        // Subir el plan permite más; bajarlo por debajo de lo que usa se rechaza.
        call(post("/api/platform/clinics/" + c.clinicId() + "/subscription/plan").contentType(MediaType.APPLICATION_JSON)
                .content("{\"planCode\":\"EQUIPO\",\"billingCycle\":\"MONTHLY\"}"), platform).andExpect(status().isOk())
                .andExpect(jsonPath("$.maxUsers").value(10));
        call(patchJson("/api/users/" + secondId, "{\"active\":true}"), c.token()).andExpect(status().isOk());
        call(post("/api/platform/clinics/" + c.clinicId() + "/subscription/plan").contentType(MediaType.APPLICATION_JSON)
                .content("{\"planCode\":\"ESENCIAL\",\"billingCycle\":\"MONTHLY\",\"maxUsers\":2}"), platform)
                .andExpect(status().isConflict());
    }

    @Test
    void concurrentUserCreationCannotExceedTheLimit() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 14, 2, null);
        var pool = java.util.concurrent.Executors.newFixedThreadPool(4);
        try {
            var tasks = new java.util.ArrayList<java.util.concurrent.Callable<Integer>>();
            for (int i = 0; i < 4; i++) {
                tasks.add(() -> newUser(c.token(), "RECEPTION").andReturn().getResponse().getStatus());
            }
            var statuses = new java.util.ArrayList<Integer>();
            for (var f : pool.invokeAll(tasks)) statuses.add(f.get());
            assertThat(statuses).filteredOn(s -> s == 201).hasSize(1);
            assertThat(statuses).filteredOn(s -> s == 409).hasSize(3);
        } finally {
            pool.shutdown();
        }
        call(get("/api/platform/clinics/" + c.clinicId()), platform).andExpect(jsonPath("$.usage.usersActive").value(2));
    }

    @Test
    void platformAccountsCannotBeSuspendedOrCancelledFromThePanel() throws Exception {
        UUID own = TenantContext.callAsSystem(() -> jdbc.queryForObject(
                "select clinic_id from app_user where id = ?::uuid", UUID.class, PlatformTestSupport.PLATFORM_ADMIN_ID));
        call(post("/api/platform/clinics/" + own + "/subscription/suspend").contentType(MediaType.APPLICATION_JSON)
                .content("{\"reason\":\"prueba\"}"), platform).andExpect(status().isConflict());
        call(post("/api/platform/clinics/" + own + "/subscription/cancel").contentType(MediaType.APPLICATION_JSON)
                .content("{\"immediately\":true,\"reason\":\"prueba\"}"), platform).andExpect(status().isConflict());
        call(get("/api/patients"), platform).andExpect(status().isOk());
    }

    @Test
    void planChangeKeepsClientModulesUnlessToldOtherwise() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 14, null, "[\"CLINICAL_RECORD\",\"TREATMENTS_CASH\",\"INVENTORY\"]");
        call(post("/api/platform/clinics/" + c.clinicId() + "/subscription/plan").contentType(MediaType.APPLICATION_JSON)
                .content("{\"planCode\":\"EQUIPO\",\"billingCycle\":\"MONTHLY\"}"), platform)
                .andExpect(jsonPath("$.modules").value(org.hamcrest.Matchers.hasItem("INVENTORY")))
                .andExpect(jsonPath("$.price").value(179000));
        call(post("/api/platform/clinics/" + c.clinicId() + "/subscription/plan").contentType(MediaType.APPLICATION_JSON)
                .content("{\"planCode\":\"EQUIPO\",\"billingCycle\":\"MONTHLY\",\"resetModules\":true}"), platform)
                .andExpect(jsonPath("$.modules").value(org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem("INVENTORY"))));
        // El plan interno no se mezcla con los de pago.
        call(post("/api/platform/clinics/" + c.clinicId() + "/subscription/plan").contentType(MediaType.APPLICATION_JSON)
                .content("{\"planCode\":\"INTERNAL\",\"billingCycle\":\"MONTHLY\"}"), platform).andExpect(status().isConflict());
    }

    // ---------- Garantías en la base de datos ----------

    @Test
    void platformTablesAreAppendOnlyAndInvisibleToClinics() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 14, null, null);
        Client other = createClient(mvc, platform, "ESENCIAL", 14, null, null);

        // La auditoría no se corrige ni se borra, ni siquiera desde el rol de la aplicación.
        assertThatThrownBy(() -> TenantContext.callAsSystem(() -> jdbc.update("update platform_audit set summary = 'x'")))
                .hasStackTraceContaining("permission denied");
        assertThatThrownBy(() -> TenantContext.callAsSystem(() -> jdbc.update("delete from platform_audit")))
                .hasStackTraceContaining("permission denied");
        assertThatThrownBy(() -> TenantContext.callAsSystem(() -> jdbc.update("delete from platform_event")))
                .hasStackTraceContaining("permission denied");

        // Dentro del contexto de una clínica: ve SU suscripción, no la de otra, y no puede modificarla.
        TenantContext.callAs(c.clinicId(), () -> {
            assertThat(jdbc.queryForObject("select count(*) from clinic_subscription", Long.class)).isEqualTo(1);
            assertThat(jdbc.queryForObject("select count(*) from clinic_subscription where clinic_id = ?", Long.class, other.clinicId())).isZero();
            assertThat(jdbc.update("update clinic_subscription set plan_code = 'GLOBAL', modules = '{}'")).isZero();
            assertThatThrownBy(() -> jdbc.update("""
                    insert into clinic_subscription (clinic_id, plan_code, status, billing_cycle, price, modules)
                    values (?, 'INTERNAL', 'ACTIVE', 'MONTHLY', 0, '{}')""", UUID.randomUUID()))
                    .hasStackTraceContaining("row-level security");
            // Datos comerciales, auditoría, eventos y medios de pago: invisibles para la clínica.
            for (String table : List.of("platform_client", "platform_audit", "platform_event", "platform_notification",
                    "subscription_payment_method")) {
                assertThat(jdbc.queryForObject("select count(*) from " + table, Long.class)).as(table).isZero();
            }
            return null;
        });
        // La clínica sigue con su plan intacto.
        call(get("/api/platform/clinics/" + c.clinicId()), platform).andExpect(jsonPath("$.subscription.planCode").value("ESENCIAL"));
    }

    // ---------- Notificaciones, eventos y avisos ----------

    @Test
    void newTrialSignupsNotifyThePlatformTeam() throws Exception {
        long before = unreadCount();
        String name = "Clínica Notificada " + UUID.randomUUID().toString().substring(0, 5);
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content("""
                {"clinicName":"%s","fullName":"Ana","email":"%s","password":"secreto123"}"""
                .formatted(name, lat.occlus.support.ApiClient.uniqueEmail("n")))).andExpect(status().isCreated());

        assertThat(unreadCount()).isEqualTo(before + 1);
        String list = call(get("/api/platform/notifications").param("unread", "true"), platform).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        List<String> titles = JsonPath.read(list, "$.content[*].event.title");
        assertThat(titles).anyMatch(t -> t.contains(name));
        String id = JsonPath.read(list, "$.content[0].id");
        call(post("/api/platform/notifications/" + id + "/read"), platform).andExpect(status().isNoContent());
        assertThat(unreadCount()).isEqualTo(before);
        call(post("/api/platform/notifications/read-all"), platform).andExpect(status().isNoContent());
        assertThat(unreadCount()).isZero();
        // El evento sigue en la línea de tiempo aunque la notificación esté leída.
        call(get("/api/platform/events").param("severity", "INFO"), platform).andExpect(jsonPath("$.totalElements").value(
                org.hamcrest.Matchers.greaterThanOrEqualTo(1)));
    }

    @Test
    void announcementsReachTheRightClinics() throws Exception {
        Client a = createClient(mvc, platform, "ESENCIAL", 14, null, null);
        Client b = createClient(mvc, platform, "ESENCIAL", 14, null, null);
        call(post("/api/platform/announcements").contentType(MediaType.APPLICATION_JSON).content(
                "{\"title\":\"Mantenimiento\",\"body\":\"El sábado a las 10 p. m.\",\"level\":\"WARNING\"}"), platform)
                .andExpect(status().isCreated());
        call(post("/api/platform/announcements").contentType(MediaType.APPLICATION_JSON).content(
                "{\"clinicId\":\"%s\",\"title\":\"Solo para ti\",\"body\":\"Tu capacitación es el lunes\",\"level\":\"INFO\"}"
                        .formatted(a.clinicId())), platform).andExpect(status().isCreated());

        List<String> forA = JsonPath.read(json(mvc, "/api/announcements", a.token()), "$[*].title");
        List<String> forB = JsonPath.read(json(mvc, "/api/announcements", b.token()), "$[*].title");
        assertThat(forA).contains("Mantenimiento", "Solo para ti");
        assertThat(forB).contains("Mantenimiento").doesNotContain("Solo para ti");

        String rows = json(mvc, "/api/platform/announcements", platform);
        String id = ((List<String>) JsonPath.read(rows, "$[?(@.title == 'Mantenimiento')].id")).get(0);
        call(post("/api/platform/announcements/" + id + "/archive"), platform).andExpect(status().isNoContent());
        assertThat((List<String>) JsonPath.read(json(mvc, "/api/announcements", a.token()), "$[*].title")).doesNotContain("Mantenimiento");
        call(post("/api/platform/announcements/" + id + "/archive"), platform).andExpect(status().isNotFound());
    }

    @Test
    void platformPlansCanBeEditedWithoutTouchingExistingClients() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 14, null, null);
        call(put("/api/platform/plans/ESENCIAL").contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"Esencial","maxUsers":5,"priceMonthly":109000,"priceAnnual":1090000,
                 "modules":["CLINICAL_RECORD","TREATMENTS_CASH","INVENTORY"],"active":true}"""), platform)
                .andExpect(status().isOk()).andExpect(jsonPath("$.priceMonthly").value(109000));
        // El cliente que ya tenía el plan conserva su precio y sus módulos.
        call(get("/api/platform/clinics/" + c.clinicId()), platform)
                .andExpect(jsonPath("$.subscription.price").value(99000))
                .andExpect(jsonPath("$.subscription.modules").value(org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem("INVENTORY"))));
        // Un plan con módulos incompletos se rechaza, y precio a medias también.
        call(put("/api/platform/plans/ESENCIAL").contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"Esencial","maxUsers":5,"priceMonthly":109000,"priceAnnual":1090000,"modules":["BILLING_RIPS"],"active":true}"""),
                platform).andExpect(status().isBadRequest());
        call(put("/api/platform/plans/ESENCIAL").contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"Esencial","maxUsers":5,"priceMonthly":109000,"modules":["CLINICAL_RECORD"],"active":true}"""),
                platform).andExpect(status().isBadRequest());
        // Restaurar el precio para no afectar a otras pruebas.
        call(put("/api/platform/plans/ESENCIAL").contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"Esencial","maxUsers":5,"priceMonthly":99000,"priceAnnual":990000,
                 "modules":["CLINICAL_RECORD","TREATMENTS_CASH"],"active":true}"""), platform).andExpect(status().isOk());
    }

    @Test
    void clientProfileCanBeEdited() throws Exception {
        Client c = createClient(mvc, platform, "ESENCIAL", 14, null, null);
        call(put("/api/platform/clinics/" + c.clinicId() + "/client").contentType(MediaType.APPLICATION_JSON).content("""
                {"clinicName":"Clínica Renombrada","nit":"800.111.222-3","contactName":"Pedro","contactEmail":"pedro@example.com",
                 "city":"Cali","internalNotes":"Pidió factura mensual"}"""), platform)
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Clínica Renombrada"))
                .andExpect(jsonPath("$.client.city").value("Cali"));
        // La auditoría lista los campos que cambiaron, pero no copia las notas internas.
        String audit = call(get("/api/platform/audit").param("clinicId", c.clinicId().toString()).param("action", "CLIENT_UPDATED"), platform)
                .andReturn().getResponse().getContentAsString();
        assertThat(audit).contains("Cali").doesNotContain("Pidió factura mensual").contains("modificadas");
        // El nombre nuevo se ve en la aplicación de la clínica.
        call(get("/api/auth/me"), c.token()).andExpect(jsonPath("$.clinicName").value("Clínica Renombrada"));
        call(get("/api/platform/clinics").param("q", "Renombrada"), platform).andExpect(jsonPath("$.totalElements").value(1));
        call(get("/api/platform/clinics").param("q", "100%_%"), platform).andExpect(jsonPath("$.totalElements").value(0));
    }

    // ---------- helpers ----------

    private ResultActions call(MockHttpServletRequestBuilder req, String token) throws Exception {
        return mvc.perform(req.header("Authorization", bearer(token)));
    }

    private ResultActions setModules(UUID clinicId, String modulesJson) throws Exception {
        return call(put("/api/platform/clinics/" + clinicId + "/modules").contentType(MediaType.APPLICATION_JSON)
                .content("{\"modules\":" + modulesJson + ",\"reason\":\"Prueba\"}"), platform);
    }

    private ResultActions newUser(String token, String role) throws Exception {
        return call(post("/api/users").contentType(MediaType.APPLICATION_JSON).content("""
                {"email":"%s","fullName":"Usuario %s","role":"%s","password":"secreto123"}"""
                .formatted(lat.occlus.support.ApiClient.uniqueEmail(role.toLowerCase()), role, role)), token);
    }

    private static MockHttpServletRequestBuilder patchJson(String path, String body) {
        return org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(path)
                .contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private long unreadCount() throws Exception {
        return ((Number) JsonPath.read(json(mvc, "/api/platform/overview", platform), "$.unreadNotifications")).longValue();
    }

    private String createPatient(String token, String doc) throws Exception {
        String body = call(post("/api/patients").contentType(MediaType.APPLICATION_JSON).content("""
                {"documentType":"CC","documentNumber":"%s","firstName":"Paciente","firstLastName":"Prueba",
                 "birthDate":"1990-01-01","sex":"M","regime":"CONTRIBUTIVO"}""".formatted(doc)), token)
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }
}
