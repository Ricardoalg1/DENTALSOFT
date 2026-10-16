package lat.occlus.cash;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

/**
 * Ingreso de un paciente (recibo de caja): abono a su cuenta o recibo de venta con detalle de procedimientos
 * ({@link PaymentItem}). El trigger tg_payment_immutable solo permite anularlo.
 */
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
    /** Abono a un financiamiento (cuotas). */
    private UUID financingId;
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

    @Enumerated(EnumType.STRING)
    private PaymentKind kind = PaymentKind.ACCOUNT;

    /** Día del ingreso (Colombia), para informes y cuadres. */
    private LocalDate incomeDate;

    /** Profesional que atendió (opcional). */
    private UUID dentistId;

    /** Tercero a cuyo nombre se expide (null = el paciente). */
    private String payerName;
    private String payerDocument;

    private String concept;

    @Enumerated(EnumType.STRING)
    private PaymentTerm paymentTerm = PaymentTerm.CASH;

    private Instant voidedAt;
    private UUID voidedBy;
    private String voidReason;

    public boolean isVoided() {
        return voidedAt != null;
    }
}
