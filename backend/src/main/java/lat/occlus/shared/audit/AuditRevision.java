package lat.occlus.shared.audit;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.envers.RevisionEntity;
import org.hibernate.envers.RevisionNumber;
import org.hibernate.envers.RevisionTimestamp;

/** Una fila por transacción que modifica entidades auditadas: cuándo, quién y en qué clínica. */
@Entity
@RevisionEntity(AuditRevisionListener.class)
@Getter
@Setter
public class AuditRevision {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @RevisionNumber
    private Long id;

    @RevisionTimestamp
    @Column(name = "rev_timestamp")
    private long timestamp;

    private UUID clinicId;

    private UUID userId;
}
