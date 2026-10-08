package lat.occlus.patient;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class PatientDtos {

    private PatientDtos() {}

    public record PatientRequest(
            @NotNull DocumentType documentType,
            @NotBlank @Pattern(regexp = "[A-Za-z0-9-]{3,20}", message = "Solo letras, números y guiones (3 a 20)")
            String documentNumber,
            @NotBlank @Size(max = 60) String firstName,
            @Size(max = 60) String middleName,
            @NotBlank @Size(max = 60) String firstLastName,
            @Size(max = 60) String secondLastName,
            @NotNull @Past LocalDate birthDate,
            @NotNull Sex sex,
            @Size(max = 30) String phone,
            @Email @Size(max = 160) String email,
            @Size(max = 200) String address,
            @Size(max = 80) String municipality,
            ResidenceZone residenceZone,
            @NotNull Regime regime,
            @Size(max = 120) String insurer,
            @Size(max = 80) String occupation,
            @Size(max = 150) String guardianName,
            @Size(max = 30) String guardianPhone,
            @Size(max = 40) String guardianRelationship,
            @Size(max = 1000) String notes,
            Boolean active,
            /** null = no cambia. */
            Boolean whatsappConsent) {}

    /** Fila del listado. */
    public record PatientSummary(
            UUID id, DocumentType documentType, String documentNumber, String fullName,
            int age, String phone, Regime regime, String insurer, boolean active) {}

    public record PatientResponse(
            UUID id, DocumentType documentType, String documentNumber,
            String firstName, String middleName, String firstLastName, String secondLastName, String fullName,
            LocalDate birthDate, int age, Sex sex,
            String phone, String email, String address, String municipality, ResidenceZone residenceZone,
            Regime regime, String insurer, String occupation,
            String guardianName, String guardianPhone, String guardianRelationship,
            String notes, boolean active, boolean whatsappConsent, Instant whatsappConsentAt,
            Instant createdAt, Instant updatedAt) {}

    /** Una versión del historial: quién, cuándo, qué tipo de cambio y qué campos cambiaron. */
    public record PatientRevision(
            long revision, Instant at, UUID userId, String userName, String type, List<FieldChange> changes) {}

    public record FieldChange(String field, String before, String after) {}
}
