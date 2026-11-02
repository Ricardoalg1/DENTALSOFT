package lat.occlus.migration;

import static lat.occlus.support.ApiClient.bearer;
import static lat.occlus.support.ApiClient.createUserAndLogin;
import static lat.occlus.support.ApiClient.registerClinic;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.io.ByteArrayOutputStream;
import java.nio.charset.Charset;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lat.occlus.TestcontainersConfiguration;
import lat.occlus.patient.Sex;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class MigrationTests {

    @Autowired
    MockMvc mvc;

    String token;

    @BeforeEach
    void setUp() throws Exception {
        token = registerClinic(mvc, "Clínica Migración");
    }

    // ---------- Lectura del archivo ----------

    @Test
    void readsCsvInWindows1252WithSemicolons() throws Exception {
        String csv = "Documento;Nombre completo;Observación\r\n1.020.345.678;\"PÉREZ; JOSÉ\";Alérgico\r\n;;\r\n";
        var file = new MockMultipartFile("file", "pacientes.csv", "text/csv", csv.getBytes(Charset.forName("windows-1252")));
        mvc.perform(multipart("/api/migration/sheet").file(file).header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.headers[2]").value("Observación"))
                .andExpect(jsonPath("$.rows.length()").value(1))
                .andExpect(jsonPath("$.rows[0][1]").value("PÉREZ; JOSÉ"))
                .andExpect(jsonPath("$.truncated").value(false));
    }

    @Test
    void readsXlsxDatesAsIso() throws Exception {
        byte[] xlsx;
        try (var wb = new XSSFWorkbook(); var out = new ByteArrayOutputStream()) {
            var sheet = wb.createSheet("Pacientes");
            var header = sheet.createRow(0);
            header.createCell(0).setCellValue("Cédula");
            header.createCell(2).setCellValue("Nacimiento");
            var row = sheet.createRow(1);
            row.createCell(0).setCellValue(1020345678d);
            var date = row.createCell(2);
            date.setCellValue(LocalDate.of(1990, 3, 15));
            var style = wb.createCellStyle();
            style.setDataFormat(wb.getCreationHelper().createDataFormat().getFormat("m/d/yy"));
            date.setCellStyle(style);
            wb.write(out);
            xlsx = out.toByteArray();
        }
        mvc.perform(multipart("/api/migration/sheet")
                        .file(new MockMultipartFile("file", "export.xlsx", "application/octet-stream", xlsx))
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.headers[1]").value("Columna 2"))
                .andExpect(jsonPath("$.rows[0][0]").value("1020345678"))
                .andExpect(jsonPath("$.rows[0][2]").value("1990-03-15"));
    }

    @Test
    void readsLegacyXls() throws Exception {
        byte[] xls;
        try (var wb = new org.apache.poi.hssf.usermodel.HSSFWorkbook(); var out = new ByteArrayOutputStream()) {
            var sheet = wb.createSheet("Hoja1");
            sheet.createRow(0).createCell(0).setCellValue("Fecha");
            var date = sheet.createRow(1).createCell(0);
            date.setCellValue(LocalDateTime.of(2021, 2, 10, 15, 30));
            var style = wb.createCellStyle();
            style.setDataFormat(wb.getCreationHelper().createDataFormat().getFormat("dd/mm/yyyy hh:mm"));
            date.setCellStyle(style);
            wb.write(out);
            xls = out.toByteArray();
        }
        mvc.perform(multipart("/api/migration/sheet")
                        .file(new MockMultipartFile("file", "viejo.xls", "application/vnd.ms-excel", xls))
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0][0]").value("2021-02-10 15:30"));
    }

    // ---------- Pacientes ----------

    @Test
    void validatesThenImportsPatients() throws Exception {
        String rows = """
                [{"row":2,"values":{"documentType":"Cédula de ciudadanía","documentNumber":"1.020.345.678",
                   "fullName":"PEREZ DE LA TORRE JUAN CARLOS","birthDate":"15/03/1990","sex":"M",
                   "regime":"Contributivo","phone":"3001234567","allergies":"Penicilina"}},
                 {"row":3,"values":{"documentNumber":"52111222","givenNames":"Ana","surnames":"Gómez Ruiz",
                   "birthDate":"1985-07-01","sex":"F","email":"no-es-correo"}},
                 {"row":4,"values":{"documentNumber":"52111222","fullName":"Ana Gómez","birthDate":"1985-07-01","sex":"F"}},
                 {"row":5,"values":{"documentNumber":"79000111","fullName":"Luis Rojas","sex":"H"}},
                 {"row":6,"values":{"documentNumber":"80000222","fullName":"Mario Díaz","birthDate":"31/31/1990","sex":"H"}}]""";

        // Sin lote: solo valida, no guarda.
        call(token, post("/api/migration/patients").content(patientRequest(null, "SKIP", rows)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.created").value(2))
                .andExpect(jsonPath("$.errors.length()").value(3))
                .andExpect(jsonPath("$.errors[0].row").value(4))
                .andExpect(jsonPath("$.errors[1].message").value("Falta la fecha de nacimiento"))
                .andExpect(jsonPath("$.errors[2].row").value(6))
                .andExpect(jsonPath("$.warnings[0].message").value("Correo «no-es-correo» no válido: no se importó"));
        call(token, get("/api/patients?q=1020345678")).andExpect(jsonPath("$.totalElements").value(0));

        String batch = createBatch("PATIENTS", "Programa X");
        call(token, post("/api/migration/patients").content(patientRequest(batch, "SKIP", rows)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.created").value(2));

        String id = JsonPath.read(call(token, get("/api/patients?q=1020345678")).andReturn().getResponse().getContentAsString(),
                "$.content[0].id");
        call(token, get("/api/patients/" + id))
                .andExpect(jsonPath("$.documentType").value("CC"))
                .andExpect(jsonPath("$.firstName").value("Juan"))
                .andExpect(jsonPath("$.middleName").value("Carlos"))
                .andExpect(jsonPath("$.firstLastName").value("Perez"))
                .andExpect(jsonPath("$.secondLastName").value("De la Torre"))
                .andExpect(jsonPath("$.sex").value("H"))
                .andExpect(jsonPath("$.regime").value("CONTRIBUTIVO"));
        call(token, get("/api/patients/" + id + "/clinical-background"))
                .andExpect(jsonPath("$.allergies").value("Penicilina"));

        // Reimportar el mismo archivo no duplica; con UPDATE se actualizan los existentes.
        call(token, post("/api/migration/patients").content(patientRequest(batch, "SKIP", rows)))
                .andExpect(jsonPath("$.created").value(0))
                .andExpect(jsonPath("$.skipped").value(2));
        call(token, post("/api/migration/patients").content(patientRequest(batch, "UPDATE", """
                [{"row":2,"values":{"documentNumber":"1020345678","fullName":"PEREZ JUAN","phone":"3109998877"}}]""")))
                .andExpect(jsonPath("$.updated").value(1));
        call(token, get("/api/patients/" + id))
                .andExpect(jsonPath("$.phone").value("3109998877"))
                .andExpect(jsonPath("$.birthDate").value("1990-03-15"))
                .andExpect(jsonPath("$.middleName").value("Carlos"))
                .andExpect(jsonPath("$.secondLastName").value("De la Torre"));

        call(token, get("/api/migration/batches"))
                .andExpect(jsonPath("$[0].created").value(2))
                .andExpect(jsonPath("$[0].skipped").value(2))
                .andExpect(jsonPath("$[0].updated").value(1))
                .andExpect(jsonPath("$[0].createdBy.name").value("Admin"));
    }

    @Test
    void onlyAdminsCanMigrate() throws Exception {
        String dentist = createUserAndLogin(mvc, token, "DENTIST", true);
        call(dentist, post("/api/migration/patients").content(patientRequest(null, "SKIP", "[]")))
                .andExpect(status().isForbidden());
        call(dentist, post("/api/migration/batches").content("""
                {"kind":"PATIENTS","sourceSystem":"X"}""")).andExpect(status().isForbidden());
    }

    // ---------- Historia clínica anterior ----------

    @Test
    void importsLegacyRecordsReadOnlyAndCanVoidTheBatch() throws Exception {
        importOnePatient("1030111222");
        String rows = """
                [{"row":2,"values":{"documentNumber":"1030111222","attendedAt":"10/02/2021 3:30 pm",
                   "professional":"Dra. Martínez","reason":"Dolor molar","diagnosisCode":"K02.1 - Caries de la dentina",
                   "description":"Se realiza resina en 36"}},
                 {"row":3,"values":{"documentNumber":"1030111222","attendedAt":"2020-01-05","diagnosisCode":"K051"}},
                 {"row":4,"values":{"documentNumber":"99999999","attendedAt":"2020-01-05","reason":"Control"}},
                 {"row":5,"values":{"documentNumber":"1030111222","attendedAt":"2020-01-05"}}]""";
        String batch = createBatch("CLINICAL_RECORDS", "Programa X");
        call(token, post("/api/migration/clinical-records").content(clinicalRequest(batch, rows)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.created").value(2))
                .andExpect(jsonPath("$.errors[0].message").value("No hay un paciente con documento 99999999: importa primero los pacientes"))
                .andExpect(jsonPath("$.errors[1].row").value(5));
        // El mismo contenido no se importa dos veces.
        call(token, post("/api/migration/clinical-records").content(clinicalRequest(batch, rows)))
                .andExpect(jsonPath("$.created").value(0))
                .andExpect(jsonPath("$.skipped").value(2));

        String patientId = JsonPath.read(call(token, get("/api/patients?q=1030111222")).andReturn().getResponse().getContentAsString(),
                "$.content[0].id");
        String assistant = createUserAndLogin(mvc, token, "ASSISTANT", false);
        call(assistant, get("/api/patients/" + patientId + "/legacy-records"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].attendedAt").value("2021-02-10T15:30:00-05:00"))
                .andExpect(jsonPath("$[0].dateOnly").value(false))
                .andExpect(jsonPath("$[0].diagnosisCode").value("K021"))
                .andExpect(jsonPath("$[0].diagnosisDescription").value("Caries de la dentina"))
                .andExpect(jsonPath("$[0].sourceSystem").value("Programa X"))
                .andExpect(jsonPath("$[0].integrityOk").value(true))
                // Sin descripción en el archivo: se toma la del catálogo CIE-10.
                .andExpect(jsonPath("$[1].diagnosisDescription").value("Gingivitis crónica"))
                .andExpect(jsonPath("$[1].dateOnly").value(true));
        String reception = createUserAndLogin(mvc, token, "RECEPTION", false);
        call(reception, get("/api/patients/" + patientId + "/legacy-records")).andExpect(status().isForbidden());

        call(token, post("/api/migration/batches/" + batch + "/void").content("""
                {"reason":"Archivo equivocado"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.voidReason").value("Archivo equivocado"));
        call(token, get("/api/patients/" + patientId + "/legacy-records")).andExpect(jsonPath("$.length()").value(0));
        call(token, post("/api/migration/clinical-records").content(clinicalRequest(batch, rows)))
                .andExpect(status().isConflict());
    }

    // ---------- Documentos ----------

    @Test
    void importsDocumentsByDocumentNumber() throws Exception {
        importOnePatient("1040555666");
        String batch = createBatch("DOCUMENTS", "Programa X");
        byte[] pdf = "%PDF-1.7\n%historia".getBytes();
        uploadDocument(batch, "1040555666", pdf, "historia.pdf")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CREATED"))
                .andExpect(jsonPath("$.patient.name").value("Ana Gómez"));
        uploadDocument(batch, "1040555666", pdf, "copia.pdf").andExpect(jsonPath("$.status").value("DUPLICATE"));
        uploadDocument(batch, "123123123", pdf, "otro.pdf").andExpect(jsonPath("$.status").value("PATIENT_NOT_FOUND"));
        uploadDocument(batch, "1040555666", "texto".getBytes(), "notas.txt").andExpect(jsonPath("$.status").value("INVALID"));

        call(token, get("/api/migration/batches"))
                .andExpect(jsonPath("$[0].created").value(1))
                .andExpect(jsonPath("$[0].skipped").value(1))
                .andExpect(jsonPath("$[0].errors").value(2));
    }

    // ---------- Interpretación de valores ----------

    @Test
    void parsesCommonDateFormats() {
        assertThat(LegacyValues.dateTime("15/03/1990", "F").value()).isEqualTo(LocalDateTime.of(1990, 3, 15, 0, 0));
        assertThat(LegacyValues.dateTime("03/15/1990", "F").value()).isEqualTo(LocalDateTime.of(1990, 3, 15, 0, 0));
        assertThat(LegacyValues.dateTime("05/04/1990", "F").value().toLocalDate()).isEqualTo(LocalDate.of(1990, 4, 5));
        assertThat(LegacyValues.dateTime("15 de marzo de 1990", "F").value().toLocalDate()).isEqualTo(LocalDate.of(1990, 3, 15));
        assertThat(LegacyValues.dateTime("15-Mar-90", "F").value().toLocalDate()).isEqualTo(LocalDate.of(1990, 3, 15));
        assertThat(LegacyValues.dateTime("1990-03-15T14:30:00", "F").value()).isEqualTo(LocalDateTime.of(1990, 3, 15, 14, 30));
        assertThat(LegacyValues.dateTime("15/03/1990 2:30 p. m.", "F").value()).isEqualTo(LocalDateTime.of(1990, 3, 15, 14, 30));
        assertThat(LegacyValues.dateTime("32947", "F").value().toLocalDate()).isEqualTo(LocalDate.of(1990, 3, 15));
        assertThatThrownBy(() -> LegacyValues.dateTime("ayer", "Fecha")).hasMessageContaining("Fecha no válida");
    }

    @Test
    void interpretsNamesSexAndDocuments() {
        assertThat(LegacyValues.splitFullName("Pérez Gómez María José", true))
                .containsExactly("María", "José", "Pérez", "Gómez");
        assertThat(LegacyValues.splitFullName("Ana de la Hoz", false)).containsExactly("Ana", null, "de la Hoz", null);
        assertThat(LegacyValues.fixUppercase("MARÍA DEL PILAR")).isEqualTo("María del Pilar");
        assertThat(LegacyValues.fixUppercase("McAllister")).isEqualTo("McAllister");
        assertThat(LegacyValues.sex("M", false)).isEqualTo(Sex.M);
        assertThat(LegacyValues.sex("Femenino", true)).isEqualTo(Sex.M);
        assertThat(LegacyValues.documentNumber("1020345678.0")).isEqualTo("1020345678");
        assertThatThrownBy(() -> LegacyValues.documentNumber("1.02E+09")).hasMessageContaining("notación científica");
    }

    // ---------- helpers ----------

    private void importOnePatient(String document) throws Exception {
        call(token, post("/api/migration/patients").content(patientRequest(createBatch("PATIENTS", "Programa X"), "SKIP", """
                [{"row":2,"values":{"documentNumber":"%s","fullName":"Gómez Ana","birthDate":"1985-07-01","sex":"F"}}]"""
                .formatted(document)))).andExpect(jsonPath("$.created").value(1));
    }

    private String createBatch(String kind, String source) throws Exception {
        return JsonPath.read(call(token, post("/api/migration/batches").content("""
                {"kind":"%s","sourceSystem":"%s","fileName":"export.csv"}""".formatted(kind, source)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
    }

    private static String patientRequest(String batchId, String onExisting, String rows) {
        return """
                {"batchId":%s,"onExisting":"%s","defaultDocumentType":"CC","defaultRegime":"NO_AFILIADO",
                 "nameOrder":"SURNAME_FIRST","letterMIsMale":true,"fixUppercase":true,"rows":%s}"""
                .formatted(batchId == null ? "null" : "\"" + batchId + "\"", onExisting, rows);
    }

    private static String clinicalRequest(String batchId, String rows) {
        return """
                {"batchId":"%s","rows":%s}""".formatted(batchId, rows);
    }

    private ResultActions uploadDocument(String batch, String document, byte[] content, String filename) throws Exception {
        return mvc.perform(multipart("/api/migration/documents")
                .file(new MockMultipartFile("file", filename, "application/octet-stream", content))
                .param("batchId", batch)
                .param("documentNumber", document)
                .header("Authorization", bearer(token)));
    }

    private ResultActions call(String token, MockHttpServletRequestBuilder req) throws Exception {
        return mvc.perform(req.header("Authorization", bearer(token)).contentType(MediaType.APPLICATION_JSON));
    }
}
