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

/**
 * Gasto (egreso) de la clínica. El trigger tg_expense_immutable solo permite anularlo. Pagado en efectivo desde
 * la caja abierta de la sede queda ligado a ese turno ({@code cashSessionId}) y se descuenta del cuadre.
 */
@Entity
@Getter
@Setter
@NoArgsConstructor
public class Expense {

    @Id
    private UUID id;

    private UUID clinicId;
    private UUID siteId;
    private UUID cashSessionId;
    private LocalDate expenseDate;

    @Enumerated(EnumType.STRING)
    private ExpenseCategory category;

    private String description;
    private String supplierName;
    private String supplierDocument;
    private String invoiceNumber;
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    private PaymentMethod method;

    private String reference;
    private UUID createdBy;

    @CreationTimestamp
    private Instant createdAt;

    private Instant voidedAt;
    private UUID voidedBy;
    private String voidReason;

    public boolean isVoided() {
        return voidedAt != null;
    }
}
