package lat.occlus.treatment;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

/** Tratamiento del catálogo de la clínica: agrupa procedimientos de la lista de precios. */
@Entity
@Getter
@Setter
@NoArgsConstructor
public class TreatmentType {

    @Id
    private UUID id;

    private UUID clinicId;
    private String name;

    @Enumerated(EnumType.STRING)
    private ProcedureCategory category;

    private String description;
    private boolean active = true;

    @CreationTimestamp
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;
}
