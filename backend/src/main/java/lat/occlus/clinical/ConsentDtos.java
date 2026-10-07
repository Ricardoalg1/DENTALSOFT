package lat.occlus.clinical;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;
import lat.occlus.clinical.ClinicalDtos.Ref;

public final class ConsentDtos {

    private ConsentDtos() {}

    public record TemplateRequest(
            @NotBlank @Size(max = 150) String title,
            @NotBlank @Size(max = 20000) String body,
            Boolean active) {}

    public record TemplateResponse(UUID id, String title, String body, boolean active, Instant updatedAt) {}

    public record ConsentRequest(
            @NotNull UUID templateId,
            @Size(max = 1000) String procedureDetail,
            @NotBlank @Size(max = 150) String signerName,
            @NotBlank @Size(max = 30) String signerDocument,
            /** "Paciente" o el parentesco del acudiente (madre, padre, tutor…). */
            @NotBlank @Size(max = 40) String signerRelationship,
            /** PNG de la firma en base64 (con o sin el prefijo data:image/png;base64,). */
            @NotBlank @Size(max = 700_000) String signaturePng) {}

    public record RevokeRequest(@NotBlank @Size(max = 500) String reason) {}

    public record ConsentResponse(
            UUID id, Ref patient, String title, String body, String procedureDetail,
            String signerName, String signerDocument, String signerRelationship, UUID signatureFileId,
            Ref professional, Instant signedAt, String contentHash, boolean integrityOk,
            Instant revokedAt, Ref revokedBy, String revocationReason) {}
}
