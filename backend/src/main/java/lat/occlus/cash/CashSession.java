package lat.occlus.cash;

import jakarta.persistence.Entity;
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

/** Turno de caja de una sede: se abre con una base y se cierra contando el efectivo. */
@Entity
@Getter
@Setter
@NoArgsConstructor
public class CashSession {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private UUID clinicId;
    private UUID siteId;
    private UUID openedBy;

    @CreationTimestamp
    private Instant openedAt;

    private BigDecimal openingAmount;
    private UUID closedBy;
    private Instant closedAt;
    private BigDecimal expectedCash;
    private BigDecimal countedCash;
    private String notes;

    public boolean isOpen() {
        return closedAt == null;
    }
}
