package lat.occlus.clinical;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

/** Nota aclaratoria sobre una evolución firmada. Solo se agregan; la BD no permite editarlas ni borrarlas. */
@Entity
@Getter
@Setter
@NoArgsConstructor
public class ClinicalNoteAddendum {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private UUID clinicId;
    private UUID noteId;
    private UUID authorId;
    private String text;

    @CreationTimestamp
    private Instant createdAt;
}
