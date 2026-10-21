package lat.occlus.migration;

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
import org.hibernate.annotations.Immutable;

/**
 * Registro de la historia clínica del programa anterior. No es una evolución de Occlus: nadie de esta
 * clínica la firmó, así que conserva el profesional original como texto. @Immutable: Hibernate nunca
 * genera UPDATE para esta entidad (y la BD tampoco lo permite, salvo las columnas de anulación).
 */
@Entity
@Immutable
@Getter
@Setter
@NoArgsConstructor
public class LegacyClinicalRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private UUID clinicId;
    private UUID patientId;
    private UUID batchId;
    private String sourceSystem;

    private Instant attendedAt;
    /** El archivo traía solo la fecha: la hora guardada (00:00 de Bogotá) no es real. */
    private boolean dateOnly;

    private String recordType;
    private String professionalName;
    private String reason;
    private String diagnosisCode;
    private String diagnosisDescription;
    private String description;
    private String procedures;
    private String plan;

    private String contentHash;

    private UUID importedBy;

    @CreationTimestamp
    private Instant importedAt;

    private Instant voidedAt;

    /**
     * SHA-256 del contenido clínico. No incluye el lote ni el programa de origen, para reconocer el mismo
     * registro si se vuelve a importar el archivo.
     */
    public String computeHash() {
        String canonical = Stream.of(patientId, attendedAt, dateOnly, recordType, professionalName, reason,
                        diagnosisCode, diagnosisDescription, description, procedures, plan)
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
