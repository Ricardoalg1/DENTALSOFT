package lat.occlus.cash;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Cuota de un financiamiento. Inmutable: se genera al crear el acuerdo. */
@Entity
@Getter
@Setter
@NoArgsConstructor
public class FinancingInstallment {

    @Id
    private UUID id;

    private UUID clinicId;
    private UUID financingId;
    private short number;
    private LocalDate dueDate;
    private BigDecimal amount;
}
