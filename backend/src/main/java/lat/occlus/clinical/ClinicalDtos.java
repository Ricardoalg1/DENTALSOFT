package lat.occlus.clinical;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public final class ClinicalDtos {

    private ClinicalDtos() {}

    public record Ref(UUID id, String name) {}

    /** Diagnóstico CIE-10: código como lo pide RIPS ("K021") y para mostrar ("K02.1"). */
    public record Diagnosis(String code, String display, String description) {}

    // ---------- Antecedentes ----------

    public record BackgroundRequest(
            @NotNull @Size(max = 30) Set<MedicalCondition> conditions,
            @NotNull @Size(max = 30) Set<Habit> habits,
            @Size(max = 500) String allergies,
            @Size(max = 500) String medications,
            @Size(max = 500) String surgicalHistory,
            @Size(max = 500) String familyHistory,
            @Size(max = 1000) String observations) {}

    /** {@code updatedAt} null = el paciente aún no tiene antecedentes registrados. */
    public record BackgroundResponse(
            List<MedicalCondition> conditions, List<Habit> habits,
            String allergies, String medications, String surgicalHistory, String familyHistory, String observations,
            Instant updatedAt, Ref updatedBy) {}

    // ---------- Evoluciones ----------

    /**
     * Crear o editar un borrador. Todo es opcional mientras es borrador; para firmar se exige
     * motivo, diagnóstico principal y tipo de diagnóstico. {@code appointmentId} solo se usa al crear.
     */
    public record NoteRequest(
            UUID appointmentId,
            OffsetDateTime attendedAt,
            @Size(max = 500) String reason,
            @Size(max = 2000) String currentIllness,
            @Size(max = 4000) String examination,
            @Size(max = 5) String diagnosisMain,
            DiagnosisType diagnosisType,
            @Size(max = 3) List<@Size(max = 5) String> diagnosisRelated,
            @Size(max = 4000) String procedures,
            @Size(max = 2000) String plan) {}

    public record AddendumRequest(@NotBlank @Size(max = 2000) String text) {}

    public record AddendumResponse(UUID id, Ref author, String text, Instant createdAt) {}

    public enum NoteStatus { DRAFT, SIGNED }

    public record NoteResponse(
            UUID id, Ref patient, Ref dentist, UUID appointmentId,
            OffsetDateTime attendedAt, NoteStatus status,
            String reason, String currentIllness, String examination,
            Diagnosis diagnosisMain, DiagnosisType diagnosisType, List<Diagnosis> diagnosisRelated,
            String procedures, String plan,
            Instant signedAt, String contentHash,
            /** Solo para firmadas: el contenido actual coincide con el hash guardado al firmar. */
            Boolean integrityOk,
            List<AddendumResponse> addenda,
            Instant createdAt, Instant updatedAt) {}

    /** Fila de los listados generales (sin el contenido clínico completo). */
    public record NoteSummary(
            UUID id, Ref patient, Ref dentist, OffsetDateTime attendedAt, NoteStatus status,
            String reason, Diagnosis diagnosisMain, Instant signedAt) {}

    // ---------- Odontograma ----------

    public record OdontogramRequest(
            @NotNull @Min(11) @Max(85) Integer tooth,
            ToothSurface surface,
            @NotNull OdontogramCondition condition,
            @Size(max = 200) String note) {}

    public record OdontogramEntryResponse(
            UUID id, int tooth, ToothSurface surface, OdontogramCondition condition, String note,
            Instant createdAt, Ref createdBy, Instant removedAt, Ref removedBy) {}
}
