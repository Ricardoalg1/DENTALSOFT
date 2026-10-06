package lat.occlus.shared.tenant;

import static lat.occlus.support.ApiClient.bearer;
import static lat.occlus.support.ApiClient.registerClinic;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.jayway.jsonpath.JsonPath;
import java.util.UUID;
import lat.occlus.TestcontainersConfiguration;
import lat.occlus.patient.Patient;
import lat.occlus.patient.PatientRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

/**
 * Prueba la ÚLTIMA línea de defensa: aunque el código consulte SIN filtrar por clinic_id
 * (findAll, findById), Postgres solo devuelve filas de la clínica del contexto.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class RowLevelSecurityTests {

    @Autowired
    MockMvc mvc;

    @Autowired
    PatientRepository patients;

    @Test
    void unfilteredQueriesOnlySeeCurrentClinic() throws Exception {
        String tokenA = registerClinic(mvc, "RLS A");
        String tokenB = registerClinic(mvc, "RLS B");
        UUID clinicA = clinicId(tokenA);
        UUID clinicB = clinicId(tokenB);
        UUID patientA = createPatient(tokenA, "70000001");
        createPatient(tokenB, "70000002");

        var seenByA = TenantContext.callAs(clinicA, patients::findAll);
        assertThat(seenByA).extracting(Patient::getClinicId).containsOnly(clinicA);

        assertThat(TenantContext.callAs(clinicB, () -> patients.findById(patientA))).isEmpty();
        assertThat(TenantContext.callAs(clinicA, () -> patients.findById(patientA))).isPresent();
    }

    @Test
    void withoutContextNothingIsVisible() throws Exception {
        String token = registerClinic(mvc, "RLS sin contexto");
        createPatient(token, "70000003");
        assertThat(patients.findAll()).isEmpty();
    }

    @Test
    void cannotInsertIntoAnotherClinic() throws Exception {
        UUID clinicA = clinicId(registerClinic(mvc, "RLS insert A"));
        UUID clinicB = clinicId(registerClinic(mvc, "RLS insert B"));

        var intruder = new Patient();
        intruder.setClinicId(clinicB); // intenta escribir en B estando en el contexto de A
        intruder.setDocumentType(lat.occlus.patient.DocumentType.CC);
        intruder.setDocumentNumber("80000001");
        intruder.setFirstName("Intruso");
        intruder.setFirstLastName("Test");
        intruder.setBirthDate(java.time.LocalDate.of(1990, 1, 1));
        intruder.setSex(lat.occlus.patient.Sex.H);
        intruder.setRegime(lat.occlus.patient.Regime.CONTRIBUTIVO);

        assertThatThrownBy(() -> TenantContext.callAs(clinicA, () -> patients.saveAndFlush(intruder)))
                .hasStackTraceContaining("row-level security");
    }

    private UUID clinicId(String token) throws Exception {
        String me = mvc.perform(get("/api/auth/me").header("Authorization", bearer(token)))
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(JsonPath.read(me, "$.clinicId"));
    }

    private UUID createPatient(String token, String doc) throws Exception {
        String json = """
                {"documentType":"CC","documentNumber":"%s","firstName":"Test","firstLastName":"RLS",
                 "birthDate":"1990-01-01","sex":"H","regime":"CONTRIBUTIVO"}""".formatted(doc);
        String body = mvc.perform(MockMvcRequestBuilders.post("/api/patients").header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content(json))
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(JsonPath.read(body, "$.id"));
    }
}
