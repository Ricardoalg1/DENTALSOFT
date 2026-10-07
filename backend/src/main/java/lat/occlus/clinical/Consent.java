package lat.occlus.clinical;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

/**
 * Consentimiento informado firmado. Guarda el texto exacto que se firmó. El trigger
 * tg_consent_immutable de Postgres impide modificarlo o borrarlo; solo se puede revocar una vez.
 */
@Entity
@Getter
@Setter
@NoArgsConstructor
public class Consent {

    @Id
    private UUID id;

    private UUID clinicId;
    private UUID patientId;
    private UUID templateId;

    private String title;
    private String body;
    private String procedureDetail;

    private String signerName;
    private String signerDocument;
    private String signerRelationship;
    private UUID signatureFileId;

    private UUID professionalId;
    private Instant signedAt;
    private String contentHash;

    private Instant revokedAt;
    private UUID revokedBy;
    private String revocationReason;

    @CreationTimestamp
    private Instant createdAt;

    /** SHA-256 de lo firmado, incluida la huella del archivo de la firma. */
    public String computeHash(String signatureSha256) {
        String canonical = Stream.of(id, patientId, title, body, procedureDetail, signerName, signerDocument,
                        signerRelationship, signatureFileId, signatureSha256, professionalId, signedAt)
                .map(v -> Objects.toString(v, ""))
                .collect(Collectors.joining("\u001F"));
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
