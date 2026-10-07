package lat.occlus.clinical;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

/** Metadatos de un archivo del paciente; el contenido está en S3 bajo {@code storageKey}. */
@Entity
@Getter
@Setter
@NoArgsConstructor
public class PatientFile {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private UUID clinicId;
    private UUID patientId;

    @Enumerated(EnumType.STRING)
    private FileCategory category;

    private String title;
    private String originalFilename;
    private String contentType;
    private long sizeBytes;
    private String sha256;
    private String storageKey;

    private UUID uploadedBy;

    @CreationTimestamp
    private Instant createdAt;

    private Instant removedAt;
    private UUID removedBy;
    private String removalReason;
}
