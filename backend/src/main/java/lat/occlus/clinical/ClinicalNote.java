package lat.occlus.clinical;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.envers.Audited;
import org.hibernate.envers.NotAudited;

/**
 * Evolución (registro de una atención). Mientras {@code signedAt} es null es un borrador editable;
 * una vez firmada, el trigger tg_clinical_note_immutable de Postgres impide cambiarla o borrarla.
 */
@Entity
@Audited
@Getter
@Setter
@NoArgsConstructor
public class ClinicalNote {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private UUID clinicId;
    private UUID patientId;
    /** Profesional que atiende y firma. */
    private UUID dentistId;
    private UUID appointmentId;

    private Instant attendedAt;

    /** Motivo de consulta. */
    private String reason;
    private String currentIllness;
    /** Examen estomatológico / hallazgos. */
    private String examination;

    private String diagnosisMain;
    @Enumerated(EnumType.STRING)
    private DiagnosisType diagnosisType;
    private String diagnosisRelated1;
    private String diagnosisRelated2;
    private String diagnosisRelated3;

    private String procedures;
    private String plan;

    private Instant signedAt;
    private String contentHash;

    @NotAudited
    @CreationTimestamp
    private Instant createdAt;

    @NotAudited
    @UpdateTimestamp
    private Instant updatedAt;

    public boolean isSigned() {
        return signedAt != null;
    }

    /**
     * SHA-256 del contenido clínico. Se guarda al firmar; si después no coincide con el contenido,
     * alguien modificó la fila por fuera de la aplicación.
     */
    public String computeHash() {
        String canonical = Stream.of(id, patientId, dentistId, appointmentId, attendedAt,
                        reason, currentIllness, examination,
                        diagnosisMain, diagnosisType, diagnosisRelated1, diagnosisRelated2, diagnosisRelated3,
                        procedures, plan, signedAt)
                .map(v -> Objects.toString(v, ""))
                // Separador de unidad (U+001F): no aparece en texto escrito por usuarios.
                .collect(Collectors.joining("\u001F"));
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
