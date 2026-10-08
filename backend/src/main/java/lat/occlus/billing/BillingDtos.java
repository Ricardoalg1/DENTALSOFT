package lat.occlus.billing;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class BillingDtos {
    private BillingDtos() {}

    public enum Status { DRAFT, PREPARED, CANCELLED }
    public enum ServiceKind { CONSULTATION, PROCEDURE }

    public record Issuer(
            @NotBlank @Size(max=150) String legalName,
            @NotBlank @Pattern(regexp="[0-9]{5,15}") String nit,
            @NotBlank @Pattern(regexp="[0-9]{12}") String providerCode,
            @NotBlank @Size(max=200) String address,
            @NotBlank @Pattern(regexp="[0-9]{5}") String municipality,
            @NotBlank @Email @Size(max=160) String email) {}

    public record Buyer(String documentType, String documentNumber, String name, String email, String address) {}

    /** Datos explícitos del paciente: nunca se infiere nacionalidad o cobertura desde su EPS. */
    public record RipsUser(
            @NotBlank @Pattern(regexp="0[1-9]|1[0-4]") String userType,
            @NotBlank @Pattern(regexp="[0-9]{3}") String countryResidence,
            @NotBlank @Pattern(regexp="[0-9]{3}") String countryOrigin,
            @Pattern(regexp="[0-9]{5}") String municipality,
            @Pattern(regexp="01|02") String zone,
            @NotBlank @Pattern(regexp="SI|NO") String incapacity,
            @Size(max=60) String siras) {}

    /** Clasificación administrativa de una atención ya documentada en una evolución firmada. */
    public record ServiceRips(
            @NotNull UUID clinicalNoteId,
            @NotBlank @Pattern(regexp="[0-9]{6}") String cupsCode,
            @NotNull ServiceKind kind,
            @NotBlank @Pattern(regexp="[0-9]{2}") String modality,
            @NotBlank @Pattern(regexp="[0-9]{2}") String group,
            @NotNull @Min(1) @Max(9999) Integer serviceCode,
            @NotBlank @Pattern(regexp="[0-9]{2}") String purpose,
            @Pattern(regexp="[0-9]{2}") String entryRoute,
            @Pattern(regexp="[0-9]{2}") String cause,
            @Size(max=30) String authorization,
            @Pattern(regexp="[0-9]{1,20}") String mipres,
            @NotBlank @Pattern(regexp="0[1-5]") String collectionConcept,
            @NotNull @DecimalMin("0") @Digits(integer=10, fraction=0) BigDecimal moderatingPayment,
            @Size(max=30) String moderatingInvoice,
            @Size(max=256) String vida) {}

    public record CreateRequest(@NotNull UUID planId,
            @NotEmpty @Size(max=100) List<@NotNull UUID> itemIds) {}

    public record CancelRequest(@NotBlank @Size(min=3,max=300) String reason) {}

    public record Line(UUID sourceItemId, String description, String cupsCode, int quantity,
            BigDecimal unitPrice, BigDecimal discount, BigDecimal total,
            ServiceRips rips, Instant attendedAt, String diagnosisMain, String diagnosisType,
            List<String> diagnosesRelated) {}

    /** Copia estable de los datos con los que se prepara el documento. */
    public record Snapshot(Issuer issuer, Buyer buyer, String patientName,
            String documentType, String documentNumber, LocalDate birthDate, String sex,
            RipsUser user, List<Line> lines) {}

    public record InvoiceResponse(UUID id, long draftNumber, UUID patientId, UUID planId,
            Status status, BigDecimal total, Instant createdAt, Instant preparedAt,
            Instant cancelledAt, String cancelReason, Snapshot snapshot, Validation validation) {}

    public record Summary(UUID id, long draftNumber, UUID patientId, String patientName,
            Status status, BigDecimal total, Instant createdAt) {}

    public record Validation(boolean dataReady, List<String> errors, List<String> warnings) {}
    public record RipsPreview(String standard, boolean draft, Validation validation, Map<String,Object> payload) {}
    public record NoteOption(UUID id, Instant attendedAt, String diagnosisMain) {}
    public record ProviderStatus(boolean configured, String name, String message) {}
}
