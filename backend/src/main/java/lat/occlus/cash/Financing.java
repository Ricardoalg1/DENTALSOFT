package lat.occlus.cash;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

/** Acuerdo de pago a cuotas de un paciente (sin intereses). Se paga con abonos ligados ({@code payment.financingId}). */
@Entity
@Getter
@Setter
@NoArgsConstructor
public class Financing {

    @Id
    private UUID id;

    private UUID clinicId;
    private UUID patientId;
    private UUID planId;
    private String concept;
    private BigDecimal totalAmount;
    private BigDecimal downPayment;
    private short installments;

    @Enumerated(EnumType.STRING)
    private FinancingFrequency frequency;

    private LocalDate firstDue;
    private String notes;
    private UUID createdBy;

    @CreationTimestamp
    private Instant createdAt;

    private Instant cancelledAt;
    private UUID cancelledBy;
    private String cancelReason;

    public boolean isCancelled() {
        return cancelledAt != null;
    }
}
