package lat.occlus.inventory;

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
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Inventario (Fase 7): reglas de negocio, garantías de la BD y concurrencia. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class InventoryTests {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcTemplate jdbc;

    String admin;
    String siteId;
    /** Insumo sin control de lotes (guantes). */
    String gloves;
    /** Insumo con lote y vencimiento (anestesia). */
    String anesthesia;

    @BeforeEach
    void setUp() throws Exception {
        admin = registerClinic(mvc, "Clínica Inventario");
        siteId = JsonPath.read(call(get("/api/sites"), admin).andReturn().getResponse().getContentAsString(), "$[0].id");
        gloves = createItem(admin, "GUA-01", "Guantes de nitrilo", "caja", "2", false).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        gloves = JsonPath.read(gloves, "$.id");
        anesthesia = JsonPath.read(createItem(admin, "ANE-01", "Lidocaína 2%", "cartucho", "10", true)
                .andReturn().getResponse().getContentAsString(), "$.id");
    }

    @Test
    void onlyAdminsManageItemsAndCodesAreUnique() throws Exception {
        String reception = createUserAndLogin(mvc, admin, "RECEPTION", false);
        createItem(reception, "X-1", "Algodón", "paquete", "0", false).andExpect(status().isForbidden());
        createItem(admin, "gua-01", "Otro", "caja", "0", false).andExpect(status().isConflict()); // código en mayúsculas
        call(get("/api/inventory"), reception).andExpect(jsonPath("$.items.length()").value(2));
    }

    @Test
    void entriesAndConsumptionsUpdateTheBalance() throws Exception {
        move(admin, op(), gloves, "ENTRY", "10", null, null).andExpect(status().isNoContent());
        move(admin, op(), gloves, "CONSUMPTION", "3", null, null).andExpect(status().isNoContent());
        move(admin, op(), gloves, "CONSUMPTION", "8", null, null)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("Existencias insuficientes en ese lote y sede."));

        assertThat(stock(gloves, siteId)).isEqualByComparingTo("7");
        call(get("/api/inventory"), admin)
                .andExpect(jsonPath("$.movements.length()").value(2))
                .andExpect(jsonPath("$.movements[0].kind").value("CONSUMPTION"))
                .andExpect(jsonPath("$.movements[0].balance").value(7));
    }

    @Test
    void lotTrackedItemsRequireLotAndCannotConsumeExpiredStock() throws Exception {
        move(admin, op(), anesthesia, "ENTRY", "20", null, null).andExpect(status().isBadRequest());
        String future = LocalDate.now().plusMonths(6).toString();
        String past = LocalDate.now().minusDays(3).toString();
        move(admin, op(), anesthesia, "ENTRY", "20", "L-100", future).andExpect(status().isNoContent());
        move(admin, op(), anesthesia, "ENTRY", "5", "L-OLD", past).andExpect(status().isNoContent());

        // El mismo lote no puede tener dos fechas de vencimiento.
        move(admin, op(), anesthesia, "ENTRY", "1", "L-100", past).andExpect(status().isConflict());
        // Vencido: no se consume, se da de baja.
        move(admin, op(), anesthesia, "CONSUMPTION", "1", "L-OLD", past).andExpect(status().isConflict());
        move(admin, op(), anesthesia, "DISCARD", "5", "L-OLD", past).andExpect(status().isNoContent());
        move(admin, op(), anesthesia, "CONSUMPTION", "2", "L-100", future).andExpect(status().isNoContent());

        assertThat(stock(anesthesia, siteId)).isEqualByComparingTo("18");
    }

    @Test
    void transferMovesStockBetweenSites() throws Exception {
        String north = JsonPath.read(call(post("/api/sites").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Sede Norte\"}"), admin).andReturn().getResponse().getContentAsString(), "$.id");
        move(admin, op(), gloves, "ENTRY", "10", null, null);
        call(post("/api/inventory/movements").contentType(MediaType.APPLICATION_JSON).content("""
                {"operationId":"%s","itemId":"%s","siteId":"%s","destinationSiteId":"%s","kind":"TRANSFER",
                 "quantity":4,"reason":"Reposición sede norte"}""".formatted(op(), gloves, siteId, north)), admin)
                .andExpect(status().isNoContent());
        assertThat(stock(gloves, siteId)).isEqualByComparingTo("6");
        assertThat(stock(gloves, north)).isEqualByComparingTo("4");
    }

    @Test
    void sameOperationIsNotAppliedTwice() throws Exception {
        String operation = op();
        move(admin, operation, gloves, "ENTRY", "10", null, null).andExpect(status().isNoContent());
        move(admin, operation, gloves, "ENTRY", "10", null, null).andExpect(status().isConflict());
        assertThat(stock(gloves, siteId)).isEqualByComparingTo("10");
    }

    @Test
    void rolesForMovements() throws Exception {
        move(admin, op(), gloves, "ENTRY", "10", null, null);
        String assistant = createUserAndLogin(mvc, admin, "ASSISTANT", false);
        String reception = createUserAndLogin(mvc, admin, "RECEPTION", false);
        move(assistant, op(), gloves, "CONSUMPTION", "1", null, null).andExpect(status().isNoContent());
        move(assistant, op(), gloves, "ADJUSTMENT", "-1", null, null).andExpect(status().isForbidden());
        move(reception, op(), gloves, "CONSUMPTION", "1", null, null).andExpect(status().isForbidden());
        move(admin, op(), gloves, "ADJUSTMENT", "-2", null, null).andExpect(status().isNoContent());
        assertThat(stock(gloves, siteId)).isEqualByComparingTo("7");
    }

    @Test
    void movementsAndBalancesCannotBeAlteredDirectly() throws Exception {
        move(admin, op(), gloves, "ENTRY", "10", null, null);
        assertThatThrownBy(() -> TenantContext.callAsSystem(() ->
                jdbc.update("update inventory_movement set delta = 100")))
                .hasStackTraceContaining("permission denied");
        assertThatThrownBy(() -> TenantContext.callAsSystem(() ->
                jdbc.update("delete from inventory_movement")))
                .hasStackTraceContaining("permission denied");
        assertThatThrownBy(() -> TenantContext.callAsSystem(() ->
                jdbc.update("update inventory_batch set quantity = 999")))
                .hasStackTraceContaining("solo se modifican mediante movimientos");
        assertThat(stock(gloves, siteId)).isEqualByComparingTo("10");
    }

    @Test
    void otherClinicCannotSeeOrMoveStock() throws Exception {
        move(admin, op(), gloves, "ENTRY", "10", null, null);
        String other = registerClinic(mvc, "Otra clínica");
        call(get("/api/inventory"), other)
                .andExpect(jsonPath("$.items.length()").value(0))
                .andExpect(jsonPath("$.stock.length()").value(0));
        String otherSite = JsonPath.read(call(get("/api/sites"), other).andReturn().getResponse().getContentAsString(), "$[0].id");
        call(post("/api/inventory/movements").contentType(MediaType.APPLICATION_JSON).content("""
                {"operationId":"%s","itemId":"%s","siteId":"%s","kind":"CONSUMPTION","quantity":1,"reason":"intento"}"""
                .formatted(op(), gloves, otherSite)), other).andExpect(status().isNotFound());
        assertThat(stock(gloves, siteId)).isEqualByComparingTo("10");
    }

    @Test
    void concurrentConsumptionsNeverGoBelowZero() throws Exception {
        move(admin, op(), gloves, "ENTRY", "3", null, null);
        var tasks = new ArrayList<Callable<Integer>>();
        for (int i = 0; i < 6; i++) {
            tasks.add(() -> move(admin, op(), gloves, "CONSUMPTION", "1", null, null).andReturn().getResponse().getStatus());
        }
        List<Integer> statuses = new ArrayList<>();
        try (var pool = Executors.newFixedThreadPool(6)) {
            for (var f : pool.invokeAll(tasks)) statuses.add(f.get());
        }
        assertThat(statuses).filteredOn(s -> s == 204).hasSize(3);
        assertThat(statuses).filteredOn(s -> s == 409).hasSize(3);
        assertThat(stock(gloves, siteId)).isEqualByComparingTo("0");
    }

    // ---------- helpers ----------

    private ResultActions call(MockHttpServletRequestBuilder req, String token) throws Exception {
        return mvc.perform(req.header("Authorization", bearer(token)));
    }

    private ResultActions createItem(String token, String code, String name, String unit, String minimum, boolean lots)
            throws Exception {
        return call(post("/api/inventory/items").contentType(MediaType.APPLICATION_JSON).content("""
                {"code":"%s","name":"%s","unit":"%s","minimum":%s,"trackLots":%s,"active":true}"""
                .formatted(code, name, unit, minimum, lots)), token);
    }

    private ResultActions move(String token, String operationId, String itemId, String kind, String quantity,
                               String lot, String expiresOn) throws Exception {
        return call(post("/api/inventory/movements").contentType(MediaType.APPLICATION_JSON).content("""
                {"operationId":"%s","itemId":"%s","siteId":"%s","kind":"%s","quantity":%s,
                 "lot":%s,"expiresOn":%s,"reason":"Prueba de inventario"}""".formatted(operationId, itemId, siteId, kind,
                quantity, lot == null ? "null" : "\"" + lot + "\"", expiresOn == null ? "null" : "\"" + expiresOn + "\"")),
                token);
    }

    private static String op() {
        return UUID.randomUUID().toString();
    }

    /** Suma de existencias del insumo en la sede, leída desde la API. */
    private java.math.BigDecimal stock(String itemId, String site) throws Exception {
        String json = call(get("/api/inventory"), admin).andReturn().getResponse().getContentAsString();
        List<Number> quantities = JsonPath.read(json,
                "$.stock[?(@.itemId == '" + itemId + "' && @.siteId == '" + site + "')].quantity");
        return quantities.stream().map(n -> new java.math.BigDecimal(n.toString()))
                .reduce(java.math.BigDecimal.ZERO, java.math.BigDecimal::add);
    }
}
