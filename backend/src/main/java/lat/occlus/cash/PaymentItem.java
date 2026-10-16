package lat.occlus.cash;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import java.math.BigDecimal;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Línea del detalle de un ingreso: procedimiento cobrado con sus datos para RIPS. Inmutable (se anula el pago). */
@Entity
@Getter
@Setter
@NoArgsConstructor
public class PaymentItem {

    @Id
    private UUID id;

    private UUID clinicId;
    private UUID paymentId;
    private short position;
    private UUID procedureId;
    private String description;
    private String cupsCode;
    private int quantity;
    /** Finalidad de la tecnología en salud (código RIPS de 2 dígitos). */
    private String purpose;
    private BigDecimal unitPrice;

    @Enumerated(EnumType.STRING)
    private DiscountType discountType;

    private BigDecimal discountValue = BigDecimal.ZERO;
    private BigDecimal total;
    private String diagnosisMain;
    private String diagnosisRelated;
}
