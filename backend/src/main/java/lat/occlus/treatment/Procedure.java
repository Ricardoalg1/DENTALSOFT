package lat.occlus.treatment;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import lat.occlus.clinical.OdontogramCondition;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

/** Procedimiento de la lista de precios de la clínica. */
@Entity
@Table(name = "service_catalog")
@Getter
@Setter
@NoArgsConstructor
public class Procedure {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private UUID clinicId;
    private String code;
    private String name;

    @Enumerated(EnumType.STRING)
    private ProcedureCategory category;

    private String cupsCode;
    private BigDecimal price;
    private boolean perTooth;

    @Enumerated(EnumType.STRING)
    private OdontogramCondition treatsCondition;

    private boolean active = true;

    @CreationTimestamp
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;
}
