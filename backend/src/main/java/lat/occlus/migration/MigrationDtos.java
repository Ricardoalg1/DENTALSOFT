package lat.occlus.migration;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lat.occlus.patient.DocumentType;
import lat.occlus.patient.Regime;
import lat.occlus.shared.web.Ref;

public final class MigrationDtos {

    private MigrationDtos() {}

    /** Máximo de filas por petición: el navegador envía el archivo en partes de este tamaño. */
    public static final int MAX_ROWS_PER_REQUEST = 500;

    /** Contenido de la hoja, como texto. Las columnas se asignan a campos en el navegador. */
    public record SheetResponse(String fileName, List<String> headers, List<List<String>> rows, boolean truncated) {}

    // ---------- Lotes ----------

    public record BatchRequest(
            @NotNull MigrationKind kind,
            @NotBlank @Size(max = 80) String sourceSystem,
            @Size(max = 255) String fileName) {}

    public record BatchResponse(
            UUID id, MigrationKind kind, String sourceSystem, String fileName, Ref createdBy, Instant createdAt,
            int created, int updated, int skipped, int errors, Instant voidedAt, String voidReason) {}

    public record VoidRequest(@NotBlank @Size(max = 300) String reason) {}

    // ---------- Filas ----------

    /**
     * Una fila del archivo ya asignada a campos: {"documentNumber": "1020…", "birthDate": "15/03/1990"…}.
     * {@code row} es el número de fila en el archivo, para que los errores digan dónde corregir.
     */
    public record ImportRow(@Min(1) int row, @NotNull Map<String, String> values) {}

    public record RowIssue(int row, String message) {}

    /** Resultado de validar o importar una parte. Al validar, created/updated dicen lo que pasaría. */
    public record ImportReport(int created, int updated, int skipped, List<RowIssue> errors, List<RowIssue> warnings) {}

    // ---------- Pacientes ----------

    /** Qué hacer si el documento ya existe en Occlus. */
    public enum OnExisting { SKIP, UPDATE }

    /** Orden del nombre cuando viene completo en una sola columna. */
    public enum NameOrder { GIVEN_FIRST, SURNAME_FIRST }

    public record PatientImportRequest(
            /** null = solo validar, sin guardar nada. */
            UUID batchId,
            @NotNull OnExisting onExisting,
            /** Para filas sin tipo de documento. */
            @NotNull DocumentType defaultDocumentType,
            /** Para filas sin régimen (o con uno que no se reconoce). */
            @NotNull Regime defaultRegime,
            @NotNull NameOrder nameOrder,
            /** En el archivo, "M" significa masculino (true) o mujer, como en RIPS (false). */
            Boolean letterMIsMale,
            /** Pasar "PEREZ GOMEZ" a "Perez Gomez". */
            Boolean fixUppercase,
            @NotNull @Size(max = MAX_ROWS_PER_REQUEST) List<@Valid ImportRow> rows) {}

    // ---------- Historia clínica anterior ----------

    public record ClinicalImportRequest(
            UUID batchId,
            @NotNull @Size(max = MAX_ROWS_PER_REQUEST) List<@Valid ImportRow> rows) {}

    public record LegacyRecordResponse(
            UUID id, String sourceSystem, OffsetDateTime attendedAt, boolean dateOnly, String recordType,
            String professionalName, String reason, String diagnosisCode, String diagnosisDescription,
            String description, String procedures, String plan, Instant importedAt, Ref importedBy,
            boolean integrityOk) {}

    // ---------- Documentos ----------

    public enum DocumentImportStatus { CREATED, DUPLICATE, PATIENT_NOT_FOUND, INVALID }

    public record DocumentImportResponse(DocumentImportStatus status, Ref patient, String message) {}

}
