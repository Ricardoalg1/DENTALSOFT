package lat.occlus.treatment;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.envers.Audited;
import org.hibernate.envers.NotAudited;

/** Un procedimiento dentro de un plan (p. ej. "Resina de fotocurado · diente 36 · OM"). */
@Entity
@Audited
@Getter
@Setter
@NoArgsConstructor
public class TreatmentItem {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private UUID clinicId;
    private UUID planId;
    private UUID serviceId;

    private String description;
    private String cupsCode;
    private Short tooth;
    private String surfaces;
    private int quantity = 1;
    private BigDecimal unitPrice;
    private BigDecimal discount = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    private ItemStatus status = ItemStatus.PENDING;

    private Instant doneAt;
    private UUID doneBy;
    private int sortOrder;

    @NotAudited
    @CreationTimestamp
    private Instant createdAt;

    /** Cantidad × precio − descuento. */
    public BigDecimal total() {
        return unitPrice.multiply(BigDecimal.valueOf(quantity)).subtract(discount);
    }
}
