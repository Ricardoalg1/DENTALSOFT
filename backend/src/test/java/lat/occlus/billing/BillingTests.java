package lat.occlus.billing;

import static lat.occlus.support.ApiClient.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.jayway.jsonpath.JsonPath;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@SpringBootTest @AutoConfigureMockMvc @Import(TestcontainersConfiguration.class)
class BillingTests {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    String admin, patientId, planId, itemId, noteId;

    @BeforeEach
    void setUp() throws Exception {
        admin=registerClinic(mvc,"Clínica Facturación");
        patientId=id(call(post("/api/patients").contentType(MediaType.APPLICATION_JSON).content("""
                {"documentType":"CC","documentNumber":"80100200","firstName":"María","firstLastName":"Ríos",
                "birthDate":"1991-01-01","sex":"M","regime":"CONTRIBUTIVO"}
                """),admin).andExpect(status().isCreated()));
        String procedure=id(call(post("/api/procedures").contentType(MediaType.APPLICATION_JSON).content("""
                {"name":"Resina","category":"RESTORATIVE","price":120000.50,"cupsCode":"232101","perTooth":true}
                """),admin).andExpect(status().isCreated()));
        planId=id(call(post("/api/patients/"+patientId+"/treatment-plans").contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Restauración\"}"),admin).andExpect(status().isCreated()));
        itemId=JsonPath.read(call(post("/api/treatment-plans/"+planId+"/items").contentType(MediaType.APPLICATION_JSON)
                .content("{\"items\":[{\"procedureId\":\""+procedure+"\",\"tooth\":36,\"discount\":0.50}]}"),admin)
                .andReturn().getResponse().getContentAsString(),"$.items[0].id");
        call(post("/api/treatment-plans/"+planId+"/accept"),admin).andExpect(status().isOk());
        call(post("/api/treatment-plans/"+planId+"/items/"+itemId+"/status").contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"DONE\"}"),admin).andExpect(status().isOk());
        noteId=id(call(post("/api/patients/"+patientId+"/clinical-notes").contentType(MediaType.APPLICATION_JSON).content("""
                {"attendedAt":"2026-10-01T09:30:00-05:00","reason":"Caries dental","diagnosisMain":"K021",
                "diagnosisType":"CONFIRMED_NEW","procedures":"Resina diente 36"}
                """),admin).andExpect(status().isCreated()));
        call(post("/api/clinical-notes/"+noteId+"/sign"),admin).andExpect(status().isOk());
    }

    @Test
    void missingDataBlocksPreparationAndProviderIsExplicitlyUnavailable() throws Exception {
        call(get("/api/billing/profile"),admin).andExpect(status().isNoContent());
        call(get("/api/billing/provider"),admin).andExpect(jsonPath("$.configured").value(false));
        String invoice=create();
        call(get("/api/invoices/"+invoice),admin).andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.total").value(120000)).andExpect(jsonPath("$.snapshot.lines[0].unitPrice").value(120000.50))
                .andExpect(jsonPath("$.validation.dataReady").value(false));
        call(post("/api/invoices/"+invoice+"/prepare"),admin).andExpect(status().isBadRequest());
    }

    @Test
    void preparedProcedureHasCurrentRipsStructureAndStableSnapshot() throws Exception {
        profile(); String invoice=create(); user(invoice); service(invoice,"PROCEDURE");
        call(post("/api/invoices/"+invoice+"/prepare"),admin).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PREPARED"));
        call(get("/api/invoices/"+invoice+"/rips-preview"),admin)
                .andExpect(jsonPath("$.draft").value(true)).andExpect(jsonPath("$.validation.dataReady").value(true))
                .andExpect(jsonPath("$.payload.numFactura").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.payload.usuarios[0].codSexo").value("F"))
                .andExpect(jsonPath("$.payload.usuarios[0].codPaisOrigen").value("170"))
                .andExpect(jsonPath("$.payload.usuarios[0].registroSIRAS").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.payload.usuarios[0].servicios.procedimientos[0].fechaInicioAtencion").value("2026-10-01 09:30"))
                .andExpect(jsonPath("$.payload.usuarios[0].servicios.procedimientos[0].codProcedimiento").value("232101"))
                .andExpect(jsonPath("$.payload.usuarios[0].servicios.procedimientos[0].codDiagnosticoPrincipal").value("K021"))
                .andExpect(jsonPath("$.payload.usuarios[0].servicios.procedimientos[0].vrServicio").value(120000));
        userRequest(invoice).andExpect(status().isConflict());
        assertThatThrownBy(() -> TenantContext.callAsSystem(() -> jdbc.update(
                "update billing_invoice set snapshot_json='{}' where id=?::uuid",invoice)))
                .hasStackTraceContaining("preparado no se modifica");
    }

    @Test
    void consultationsUseTheirOwnDiagnosisAndCauseFields() throws Exception {
        profile(); String invoice=create(); user(invoice); service(invoice,"CONSULTATION");
        call(get("/api/invoices/"+invoice+"/rips-preview"),admin)
                .andExpect(jsonPath("$.payload.usuarios[0].servicios.consultas[0].tipoDiagnosticoPrincipal").value("02"))
                .andExpect(jsonPath("$.payload.usuarios[0].servicios.consultas[0].causaMotivoAtencion").value("38"))
                .andExpect(jsonPath("$.payload.usuarios[0].servicios.consultas[0].codDiagnosticoRelacionado1CIE11").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void reservationPreventsDoubleBillingAndReopeningUntilCancelled() throws Exception {
        String invoice=create();
        createRequest().andExpect(status().isConflict());
        call(get("/api/treatment-plans/"+planId+"/billable-items"),admin).andExpect(jsonPath("$.length()").value(0));
        call(post("/api/treatment-plans/"+planId+"/items/"+itemId+"/status").contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"PENDING\"}"),admin).andExpect(status().isConflict());
        call(post("/api/invoices/"+invoice+"/cancel").contentType(MediaType.APPLICATION_JSON)
                .content("{\"reason\":\"Presupuesto a corregir\"}"),admin).andExpect(jsonPath("$.status").value("CANCELLED"));
        createRequest().andExpect(status().isCreated());
    }

    @Test
    void simultaneousDraftsReserveEachProcedureOnlyOnce() throws Exception {
        try(var pool=Executors.newFixedThreadPool(2)) {
            Callable<Integer> task=() -> createRequest().andReturn().getResponse().getStatus();
            var futures=pool.invokeAll(List.of(task,task));
            assertThat(List.of(futures.get(0).get(),futures.get(1).get())).containsExactlyInAnyOrder(201,409);
        }
    }

    @Test
    void billingIsAdminOnlyAndIsolatedBetweenClinics() throws Exception {
        profile(); String invoice=create();
        String reception=createUserAndLogin(mvc,admin,"RECEPTION",false);
        call(get("/api/invoices"),reception).andExpect(status().isForbidden());
        String other=registerClinic(mvc,"Otra clínica");
        call(get("/api/invoices/"+invoice),other).andExpect(status().isNotFound());
        call(get("/api/billing/profile"),other).andExpect(status().isNoContent());
        call(get("/api/invoices"),other).andExpect(jsonPath("$.length()").value(0));
        call(get("/api/invoices/"+invoice+"/rips-preview"),other).andExpect(status().isNotFound());
    }

    private void profile() throws Exception {
        call(put("/api/billing/profile").contentType(MediaType.APPLICATION_JSON).content("""
                {"legalName":"Clínica Facturación","nit":"900123456","providerCode":"110010000001",
                "address":"Calle 10","municipality":"11001","email":"facturas@example.test"}
                """),admin).andExpect(status().isOk());
    }
    private ResultActions userRequest(String invoice) throws Exception {
        return call(put("/api/invoices/"+invoice+"/rips-user").contentType(MediaType.APPLICATION_JSON).content("""
                {"userType":"01","countryResidence":"170","countryOrigin":"170","municipality":"11001",
                "zone":"01","incapacity":"NO"}
                """),admin);
    }
    private void user(String invoice) throws Exception { userRequest(invoice).andExpect(status().isOk()); }
    private void service(String invoice,String kind) throws Exception {
        call(put("/api/invoices/"+invoice+"/items/"+itemId+"/rips").contentType(MediaType.APPLICATION_JSON).content("""
                {"clinicalNoteId":"%s","cupsCode":"232101","kind":"%s","modality":"01","group":"01",
                "serviceCode":334,"purpose":"44","entryRoute":"01","cause":"38",
                "collectionConcept":"05","moderatingPayment":0}
                """.formatted(noteId,kind)),admin).andExpect(status().isOk());
    }
    private ResultActions createRequest() throws Exception {
        return call(post("/api/invoices").contentType(MediaType.APPLICATION_JSON)
                .content("{\"planId\":\""+planId+"\",\"itemIds\":[\""+itemId+"\"]}"),admin);
    }
    private String create() throws Exception { return id(createRequest().andExpect(status().isCreated())); }
    private ResultActions call(MockHttpServletRequestBuilder req,String token) throws Exception { return mvc.perform(req.header("Authorization",bearer(token))); }
    private String id(ResultActions result) throws Exception { return JsonPath.read(result.andReturn().getResponse().getContentAsString(),"$.id"); }
}
