package lat.occlus.treatment;

import static lat.occlus.support.ApiClient.bearer;
import static lat.occlus.support.ApiClient.createUserAndLogin;
import static lat.occlus.support.ApiClient.registerClinic;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
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

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class TreatmentAndCashTests {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcTemplate jdbc;

    /** Administrador que registró la clínica: también es profesional. */
    String admin;
    String patientId;
    String siteId;
    String resinId;
    String cleaningId;
    String extractionId;

    @BeforeEach
    void setUp() throws Exception {
        admin = registerClinic(mvc, "Clínica Tratamientos");
        patientId = createPatient("70000001");
        siteId = JsonPath.read(call(get("/api/sites"), admin).andReturn().getResponse().getContentAsString(), "$[0].id");
        String list = call(post("/api/procedures/examples"), admin)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(13))
                .andReturn().getResponse().getContentAsString();
        resinId = idByName(list, "Resina de fotocurado");
        cleaningId = idByName(list, "Profilaxis y detartraje");
        extractionId = idByName(list, "Exodoncia simple");
    }

    // ---------- Lista de precios ----------

    @Test
    void priceListIsAdminOnlyAndNamesAreUnique() throws Exception {
        String reception = createUserAndLogin(mvc, admin, "RECEPTION", false);
        String body = """
                {"name":"Blanqueamiento","category":"OTHER","price":350000,"perTooth":false}""";
        call(post("/api/procedures").contentType(MediaType.APPLICATION_JSON).content(body), reception)
                .andExpect(status().isForbidden());
        call(post("/api/procedures").contentType(MediaType.APPLICATION_JSON).content(body), admin)
                .andExpect(status().isCreated());
        call(post("/api/procedures").contentType(MediaType.APPLICATION_JSON).content(body), admin)
                .andExpect(status().isConflict());
        // Todos los roles pueden consultarla (recepción cotiza).
        call(get("/api/procedures"), reception).andExpect(jsonPath("$.length()").value(14));
    }

    @Test
    void importsProceduresFromCups() throws Exception {
        String body = """
                {"price":120000,"items":[
                  {"cupsCode":"230101","name":"EXODONCIA DE DIENTE PERMANENTE UNIRRADICULAR","category":"SURGERY"},
                  {"cupsCode":"890203","name":"CONSULTA DE CONTROL POR ODONTOLOGIA GENERAL","category":"DIAGNOSIS"}]}""";
        String reception = createUserAndLogin(mvc, admin, "RECEPTION", false);
        call(post("/api/procedures/import-cups").contentType(MediaType.APPLICATION_JSON).content(body), reception)
                .andExpect(status().isForbidden());
        call(post("/api/procedures/import-cups").contentType(MediaType.APPLICATION_JSON).content(body), admin)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.created").value(2))
                .andExpect(jsonPath("$.skipped").value(0));
        // Repetir no duplica: ya existen por código CUPS.
        call(post("/api/procedures/import-cups").contentType(MediaType.APPLICATION_JSON).content(body), admin)
                .andExpect(jsonPath("$.created").value(0))
                .andExpect(jsonPath("$.skipped").value(2));
        call(get("/api/procedures"), admin)
                .andExpect(jsonPath("$[?(@.cupsCode=='230101')].perTooth").value(org.hamcrest.Matchers.contains(true)))
                .andExpect(jsonPath("$[?(@.cupsCode=='890203')].perTooth").value(org.hamcrest.Matchers.contains(false)));
    }

    // ---------- Planes ----------

    @Test
    void planLifecycleWithTotals() throws Exception {
        String planId = createPlan(admin);
        addItems(admin, planId, """
                [{"procedureId":"%s","tooth":36,"surfaces":"OM"},
                 {"procedureId":"%s","tooth":46,"discount":20000},
                 {"procedureId":"%s"}]""".formatted(resinId, resinId, cleaningId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(3))
                .andExpect(jsonPath("$.totals.total").value(310000)); // 120.000 + 100.000 + 90.000

        // Un procedimiento por diente necesita el diente.
        addItems(admin, planId, "[{\"procedureId\":\"%s\"}]".formatted(resinId)).andExpect(status().isBadRequest());

        call(post("/api/treatment-plans/" + planId + "/accept"), admin)
                .andExpect(jsonPath("$.status").value("ACCEPTED"));
        // Aceptado: ya no se edita el presupuesto.
        addItems(admin, planId, "[{\"procedureId\":\"%s\"}]".formatted(cleaningId)).andExpect(status().isConflict());

        var items = itemIds(planId);
        setItem(planId, items.get(0), "DONE").andExpect(jsonPath("$.totals.done").value(120000));
        setItem(planId, items.get(1), "CANCELLED").andExpect(jsonPath("$.totals.total").value(210000));
        setItem(planId, items.get(2), "DONE")
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.totals.pending").value(0));
        // Reabrir un ítem devuelve el plan a aceptado.
        setItem(planId, items.get(2), "PENDING").andExpect(jsonPath("$.status").value("ACCEPTED"));
    }

    @Test
    void suggestionsComeFromOdontogramFindings() throws Exception {
        mark(36, "O", "CARIES");
        mark(36, "M", "CARIES");
        mark(85, null, "EXTRACTION_INDICATED");
        mark(11, null, "CROWN"); // tratamiento existente: no se sugiere nada

        call(get("/api/patients/" + patientId + "/treatment-suggestions"), admin)
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].tooth").value(36))
                .andExpect(jsonPath("$[0].surfaces").value("OM"))
                .andExpect(jsonPath("$[0].procedureName").value("Resina de fotocurado"))
                .andExpect(jsonPath("$[1].tooth").value(85))
                .andExpect(jsonPath("$[1].procedureId").value(extractionId));

        // Lo que ya está presupuestado deja de sugerirse.
        String planId = createPlan(admin);
        addItems(admin, planId, "[{\"procedureId\":\"%s\",\"tooth\":36,\"surfaces\":\"OM\"}]".formatted(resinId));
        call(get("/api/patients/" + patientId + "/treatment-suggestions"), admin)
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].tooth").value(85));
    }

    @Test
    void receptionAcceptsButDoesNotEditPlans() throws Exception {
        String reception = createUserAndLogin(mvc, admin, "RECEPTION", false);
        call(post("/api/patients/" + patientId + "/treatment-plans").contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"X\"}"), reception).andExpect(status().isForbidden());
        String planId = createPlan(admin);
        addItems(admin, planId, "[{\"procedureId\":\"%s\"}]".formatted(cleaningId));
        call(post("/api/treatment-plans/" + planId + "/accept"), reception)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.acceptedBy.name").exists());
        setItem(planId, itemIds(planId).getFirst(), "DONE", reception).andExpect(status().isForbidden());
    }

    // ---------- Caja y pagos ----------

    @Test
    void paymentsNeedAnOpenCashSessionAndUpdateTheAccount() throws Exception {
        pay("50000", "CASH").andExpect(status().isConflict());

        String reception = createUserAndLogin(mvc, admin, "RECEPTION", false);
        String sessionId = openCash(reception, "100000");
        openCashRequest(reception, "0").andExpect(status().isConflict()); // una por sede

        // Plan aceptado de 210.000 con 120.000 realizados.
        String planId = createPlan(admin);
        addItems(admin, planId, "[{\"procedureId\":\"%s\",\"tooth\":36},{\"procedureId\":\"%s\"}]".formatted(resinId, cleaningId));
        call(post("/api/treatment-plans/" + planId + "/accept"), admin);
        setItem(planId, itemIds(planId).getFirst(), "DONE");

        pay("50000", "CASH").andExpect(status().isCreated()).andExpect(jsonPath("$.receiptNumber").value(1));
        String transfer = JsonPath.read(pay("100000", "TRANSFER").andExpect(jsonPath("$.receiptNumber").value(2))
                .andReturn().getResponse().getContentAsString(), "$.id");

        call(get("/api/patients/" + patientId + "/account"), reception)
                .andExpect(jsonPath("$.budgeted").value(210000))
                .andExpect(jsonPath("$.done").value(120000))
                .andExpect(jsonPath("$.paid").value(150000))
                .andExpect(jsonPath("$.balance").value(-30000)); // anticipo a favor

        // Anular: solo el administrador, con motivo.
        call(post("/api/payments/" + transfer + "/void").contentType(MediaType.APPLICATION_JSON)
                .content("{\"reason\":\"Transferencia rechazada\"}"), reception).andExpect(status().isForbidden());
        call(post("/api/payments/" + transfer + "/void").contentType(MediaType.APPLICATION_JSON)
                .content("{\"reason\":\"Transferencia rechazada\"}"), admin)
                .andExpect(jsonPath("$.voidReason").value("Transferencia rechazada"));
        call(get("/api/patients/" + patientId + "/account"), admin).andExpect(jsonPath("$.balance").value(70000));

        // Cierre: esperado = base 100.000 + 50.000 en efectivo; contaron 145.000 → faltan 5.000.
        call(post("/api/cash-sessions/" + sessionId + "/close").contentType(MediaType.APPLICATION_JSON)
                .content("{\"countedCash\":145000}"), reception)
                .andExpect(jsonPath("$.expectedCash").value(150000))
                .andExpect(jsonPath("$.difference").value(-5000))
                .andExpect(jsonPath("$.collected").value(50000))
                .andExpect(jsonPath("$.voidedCount").value(1));

        pay("10000", "CASH").andExpect(status().isConflict()); // caja cerrada
        call(post("/api/cash-sessions/" + sessionId + "/close").contentType(MediaType.APPLICATION_JSON)
                .content("{\"countedCash\":1}"), reception).andExpect(status().isConflict());
    }

    @Test
    void paymentsAndClosedSessionsAreImmutableInTheDatabase() throws Exception {
        String sessionId = openCash(admin, "0");
        String paymentId = JsonPath.read(pay("80000", "CASH").andReturn().getResponse().getContentAsString(), "$.id");

        assertThatThrownBy(() -> TenantContext.callAsSystem(() ->
                jdbc.update("update payment set amount = 1 where id = ?::uuid", paymentId)))
                .hasStackTraceContaining("no se modifica");
        assertThatThrownBy(() -> TenantContext.callAsSystem(() ->
                jdbc.update("delete from payment where id = ?::uuid", paymentId)))
                .hasStackTraceContaining("permission denied");

        call(post("/api/cash-sessions/" + sessionId + "/close").contentType(MediaType.APPLICATION_JSON)
                .content("{\"countedCash\":80000}"), admin).andExpect(jsonPath("$.difference").value(0));
        assertThatThrownBy(() -> TenantContext.callAsSystem(() ->
                jdbc.update("update cash_session set counted_cash = 0 where id = ?::uuid", sessionId)))
                .hasStackTraceContaining("ya está cerrada");
        // Tampoco se anula un pago de una caja ya cerrada.
        call(post("/api/payments/" + paymentId + "/void").contentType(MediaType.APPLICATION_JSON)
                .content("{\"reason\":\"tarde\"}"), admin).andExpect(status().isConflict());
    }

    @Test
    void concurrentPaymentsGetUniqueConsecutiveReceipts() throws Exception {
        openCash(admin, "0");
        var tasks = new ArrayList<Callable<String>>();
        for (int i = 0; i < 8; i++) {
            tasks.add(() -> pay("1000", "CASH").andReturn().getResponse().getContentAsString());
        }
        var numbers = new ArrayList<Integer>();
        try (var pool = Executors.newFixedThreadPool(8)) {
            for (var f : pool.invokeAll(tasks)) numbers.add(JsonPath.read(f.get(), "$.receiptNumber"));
        }
        assertThat(numbers).containsExactlyInAnyOrder(1, 2, 3, 4, 5, 6, 7, 8);
    }

    @Test
    void closingRacesWithPaymentsWithoutLosingCollectedCash() throws Exception {
        String sessionId = openCash(admin, "10000");
        var start = new java.util.concurrent.CountDownLatch(1);
        var tasks = new ArrayList<Callable<Integer>>();
        for (int i = 0; i < 8; i++) tasks.add(() -> {
            start.await();
            return pay("1000", "CASH").andReturn().getResponse().getStatus();
        });
        tasks.add(() -> {
            start.await();
            return call(post("/api/cash-sessions/" + sessionId + "/close").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"countedCash\":10000}"), admin).andReturn().getResponse().getStatus();
        });
        var statuses = new ArrayList<Integer>();
        try (var pool = Executors.newFixedThreadPool(9)) {
            var futures = tasks.stream().map(pool::submit).toList();
            start.countDown();
            for (var f : futures) statuses.add(f.get());
        }
        assertThat(statuses.getLast()).isEqualTo(200);
        assertThat(statuses.subList(0, 8)).allMatch(s -> s == 201 || s == 409);
        long successful = statuses.subList(0, 8).stream().filter(s -> s == 201).count();
        call(get("/api/cash-sessions/" + sessionId), admin)
                .andExpect(jsonPath("$.expectedCash").value(10000 + successful * 1000))
                .andExpect(jsonPath("$.payments.length()").value((int) successful));
    }

    @Test
    void otherClinicCannotSeePlansOrPayments() throws Exception {
        String planId = createPlan(admin);
        openCash(admin, "0");
        String paymentId = JsonPath.read(pay("5000", "CASH").andReturn().getResponse().getContentAsString(), "$.id");
        String other = registerClinic(mvc, "Otra clínica");
        call(get("/api/treatment-plans/" + planId), other).andExpect(status().isNotFound());
        call(get("/api/payments/" + paymentId), other).andExpect(status().isNotFound());
        call(get("/api/patients/" + patientId + "/account"), other).andExpect(status().isNotFound());
    }

    // ---------- helpers ----------

    private ResultActions call(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req, String token)
            throws Exception {
        return mvc.perform(req.header("Authorization", bearer(token)));
    }

    private String createPlan(String token) throws Exception {
        return JsonPath.read(call(post("/api/patients/" + patientId + "/treatment-plans")
                .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Plan inicial\"}"), token)
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
    }

    private ResultActions addItems(String token, String planId, String itemsJson) throws Exception {
        return call(post("/api/treatment-plans/" + planId + "/items").contentType(MediaType.APPLICATION_JSON)
                .content("{\"items\":" + itemsJson + "}"), token);
    }

    private List<String> itemIds(String planId) throws Exception {
        return JsonPath.read(call(get("/api/treatment-plans/" + planId), admin).andReturn().getResponse()
                .getContentAsString(), "$.items[*].id");
    }

    private ResultActions setItem(String planId, String itemId, String status) throws Exception {
        return setItem(planId, itemId, status, admin);
    }

    private ResultActions setItem(String planId, String itemId, String status, String token) throws Exception {
        return call(post("/api/treatment-plans/" + planId + "/items/" + itemId + "/status")
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"" + status + "\"}"), token);
    }

    private void mark(int tooth, String surface, String condition) throws Exception {
        call(post("/api/patients/" + patientId + "/odontogram").contentType(MediaType.APPLICATION_JSON).content(
                "{\"tooth\":%d,\"surface\":%s,\"condition\":\"%s\"}".formatted(
                        tooth, surface == null ? "null" : "\"" + surface + "\"", condition)), admin)
                .andExpect(status().isOk());
    }

    @Test
    void saleReceiptWithDetailDoesNotTouchTheAccount() throws Exception {
        openCash(admin, "0");
        String sale = """
                {"siteId":"%s","method":"CASH","kind":"SALE","concept":"Atención del día","payerName":"Empresa SAS",
                 "payerDocument":"NIT 900123456","items":[
                  {"procedureId":"%s","description":"Resina de fotocurado","cupsCode":"232101","quantity":2,"purpose":"16",
                   "unitPrice":100000,"discountType":"PERCENT","discountValue":10,"diagnosisMain":"K02.1"},
                  {"description":"Profilaxis","quantity":1,"unitPrice":80000,"discountType":"AMOUNT","discountValue":5000}]}"""
                .formatted(siteId, resinId);
        String json = call(post("/api/patients/" + patientId + "/payments").contentType(MediaType.APPLICATION_JSON).content(sale), admin)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.kind").value("SALE"))
                // 2 × 100.000 − 10 % = 180.000; 80.000 − 5.000 = 75.000.
                .andExpect(jsonPath("$.amount").value(255000.0))
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].total").value(180000.0))
                .andExpect(jsonPath("$.items[0].discount").value(20000.0))
                .andExpect(jsonPath("$.items[0].diagnosisMain").value("K021"))
                .andExpect(jsonPath("$.items[0].procedure.name").value("Resina de fotocurado"))
                .andExpect(jsonPath("$.payerName").value("Empresa SAS"))
                .andReturn().getResponse().getContentAsString();
        // El recibo de venta no se descuenta del estado de cuenta; el abono sí.
        call(get("/api/patients/" + patientId + "/account"), admin).andExpect(jsonPath("$.paid").value(0));
        pay("50000", "CASH").andExpect(status().isCreated()).andExpect(jsonPath("$.kind").value("ACCOUNT"));
        call(get("/api/patients/" + patientId + "/account"), admin).andExpect(jsonPath("$.paid").value(50000.0));

        // Listado de Recaudos: los dos ingresos de hoy; filtrado por tipo.
        call(get("/api/payments"), admin).andExpect(jsonPath("$.totalElements").value(2));
        call(get("/api/payments?kind=SALE&q=Empresa"), admin)
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value((String) JsonPath.read(json, "$.id")));

        // Validaciones: venta sin detalle, abono con detalle, descuento mayor que la línea, crédito, fecha futura.
        String base = "{\"siteId\":\"" + siteId + "\",\"method\":\"CASH\",";
        String line = "{\"description\":\"X\",\"quantity\":1,\"unitPrice\":1000";
        for (String bad : new String[] {
                base + "\"kind\":\"SALE\",\"items\":[]}",
                base + "\"amount\":1000,\"items\":[" + line + "}]}",
                base + "\"kind\":\"SALE\",\"items\":[" + line + ",\"discountType\":\"AMOUNT\",\"discountValue\":2000}]}",
                base + "\"kind\":\"SALE\",\"paymentTerm\":\"CREDIT\",\"items\":[" + line + "}]}",
                base + "\"amount\":1000,\"incomeDate\":\"2999-01-01\"}"}) {
            call(post("/api/patients/" + patientId + "/payments").contentType(MediaType.APPLICATION_JSON).content(bad), admin)
                    .andExpect(status().isBadRequest());
        }
    }

    @Test
    void cashExpensesReduceTheExpectedCash() throws Exception {
        String sessionId = openCash(admin, "100000");
        pay("50000", "CASH").andExpect(status().isCreated());
        String expense = """
                {"siteId":"%s","category":"SUPPLIES","description":"Guantes de nitrilo","supplierName":"Dental Sur",
                 "supplierDocument":"NIT 800111222","amount":30000,"method":"CASH","fromCash":true}""".formatted(siteId);
        String id = JsonPath.read(call(post("/api/expenses").contentType(MediaType.APPLICATION_JSON).content(expense), admin)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.cashSessionId").value(sessionId))
                .andReturn().getResponse().getContentAsString(), "$.id");
        // Un gasto por transferencia no sale de la caja.
        call(post("/api/expenses").contentType(MediaType.APPLICATION_JSON).content(
                expense.replace("\"CASH\",\"fromCash\":true", "\"TRANSFER\"")), admin).andExpect(status().isCreated());
        call(post("/api/expenses").contentType(MediaType.APPLICATION_JSON).content(
                expense.replace("\"CASH\"", "\"TRANSFER\"")), admin).andExpect(status().isBadRequest());
        // Base 100.000 + efectivo 50.000 − gasto 30.000.
        call(get("/api/cash-sessions/" + sessionId), admin)
                .andExpect(jsonPath("$.expectedCash").value(120000.0))
                .andExpect(jsonPath("$.cashExpenses").value(30000.0));
        call(get("/api/expenses"), admin).andExpect(jsonPath("$.totalElements").value(2));

        String reception = createUserAndLogin(mvc, admin, "RECEPTION", false);
        String dentist = createUserAndLogin(mvc, admin, "DENTIST", true);
        call(get("/api/expenses"), dentist).andExpect(status().isForbidden());
        call(post("/api/expenses/" + id + "/void").contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Duplicado\"}"), reception)
                .andExpect(status().isForbidden());
        call(post("/api/expenses/" + id + "/void").contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Duplicado\"}"), admin)
                .andExpect(status().isOk());
        call(get("/api/cash-sessions/" + sessionId), admin).andExpect(jsonPath("$.expectedCash").value(150000.0));
    }

    @Test
    void financingScheduleIsCoveredInOrder() throws Exception {
        openCash(admin, "0");
        String firstDue = java.time.LocalDate.now(java.time.ZoneId.of("America/Bogota")).plusDays(30).toString();
        String body = """
                {"concept":"Ortodoncia","totalAmount":300000,"downPayment":60000,"installments":3,
                 "frequency":"MONTHLY","firstDue":"%s"}""".formatted(firstDue);
        String financing = call(post("/api/patients/" + patientId + "/financings").contentType(MediaType.APPLICATION_JSON).content(body), admin)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.schedule.length()").value(4))
                .andExpect(jsonPath("$.schedule[1].amount").value(80000.0))
                .andExpect(jsonPath("$.schedule[3].dueDate").value(java.time.LocalDate.parse(firstDue).plusMonths(2).toString()))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andReturn().getResponse().getContentAsString();
        String financingId = JsonPath.read(financing, "$.id");

        // 100.000 cubren la cuota inicial (60.000) y 40.000 de la primera cuota.
        call(post("/api/patients/" + patientId + "/payments").contentType(MediaType.APPLICATION_JSON).content(
                "{\"siteId\":\"%s\",\"amount\":100000,\"method\":\"CASH\",\"financingId\":\"%s\"}".formatted(siteId, financingId)), admin)
                .andExpect(status().isCreated());
        call(get("/api/financings/" + financingId), admin)
                .andExpect(jsonPath("$.paid").value(100000.0))
                .andExpect(jsonPath("$.balance").value(200000.0))
                .andExpect(jsonPath("$.schedule[0].status").value("PAID"))
                .andExpect(jsonPath("$.schedule[1].status").value("PARTIAL"))
                .andExpect(jsonPath("$.nextDue").value(firstDue));
        call(get("/api/financings?status=ACTIVE&q=ortodon"), admin).andExpect(jsonPath("$.length()").value(1));
        call(get("/api/patients/" + patientId + "/account"), admin).andExpect(jsonPath("$.paid").value(100000.0));

        // Validaciones y permisos.
        call(post("/api/patients/" + patientId + "/financings").contentType(MediaType.APPLICATION_JSON).content(
                body.replace("\"downPayment\":60000", "\"downPayment\":300000")), admin).andExpect(status().isBadRequest());
        String reception = createUserAndLogin(mvc, admin, "RECEPTION", false);
        call(post("/api/financings/" + financingId + "/cancel").contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Desiste\"}"), reception)
                .andExpect(status().isForbidden());
        call(post("/api/financings/" + financingId + "/cancel").contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Desiste\"}"), admin)
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        call(post("/api/patients/" + patientId + "/payments").contentType(MediaType.APPLICATION_JSON).content(
                "{\"siteId\":\"%s\",\"amount\":1000,\"method\":\"CASH\",\"financingId\":\"%s\"}".formatted(siteId, financingId)), admin)
                .andExpect(status().isBadRequest());
    }

    private ResultActions openCashRequest(String token, String base) throws Exception {
        return call(post("/api/cash-sessions").contentType(MediaType.APPLICATION_JSON)
                .content("{\"siteId\":\"%s\",\"openingAmount\":%s}".formatted(siteId, base)), token);
    }

    private String openCash(String token, String base) throws Exception {
        return JsonPath.read(openCashRequest(token, base).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString(), "$.id");
    }

    private ResultActions pay(String amount, String method) throws Exception {
        return call(post("/api/patients/" + patientId + "/payments").contentType(MediaType.APPLICATION_JSON)
                .content("{\"siteId\":\"%s\",\"amount\":%s,\"method\":\"%s\"}".formatted(siteId, amount, method)), admin);
    }

    private String createPatient(String doc) throws Exception {
        String json = """
                {"documentType":"CC","documentNumber":"%s","firstName":"Mario","firstLastName":"Ríos",
                 "birthDate":"1980-02-02","sex":"H","regime":"CONTRIBUTIVO"}""".formatted(doc);
        return JsonPath.read(call(post("/api/patients").contentType(MediaType.APPLICATION_JSON).content(json), admin)
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
    }

    private static String idByName(String json, String name) {
        List<String> ids = JsonPath.read(json, "$[?(@.name == '" + name + "')].id");
        return ids.getFirst();
    }
}
