package lat.occlus.cash;

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

/** Pago o abono de un paciente (recibo de caja). El trigger tg_payment_immutable solo permite anularlo. */
@Entity
@Getter
@Setter
@NoArgsConstructor
public class Payment {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private UUID clinicId;
    private UUID patientId;
    private UUID planId;
    private UUID cashSessionId;
    private long receiptNumber;
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    private PaymentMethod method;

    private String reference;
    private String notes;
    private UUID receivedBy;

    @CreationTimestamp
    private Instant receivedAt;

    private Instant voidedAt;
    private UUID voidedBy;
    private String voidReason;

    public boolean isVoided() {
        return voidedAt != null;
    }
}
