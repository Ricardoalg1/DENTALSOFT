package lat.occlus.clinic;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

@Entity
@Getter
@Setter
@NoArgsConstructor
public class Clinic {

    /** Asignado en Java (no por Hibernate) para poder fijar el contexto de clínica antes de insertarla. */
    @Id
    private UUID id;

    private String name;

    private String nit;

    @CreationTimestamp
    private Instant createdAt;

    public Clinic(UUID id, String name, String nit) {
        this.id = id;
        this.name = name;
        this.nit = nit;
    }
}
