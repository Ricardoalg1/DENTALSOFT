package lat.occlus.billing;

import jakarta.persistence.*;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity @Getter @Setter @NoArgsConstructor
public class InvoiceReservation {
    @Id @GeneratedValue(strategy=GenerationType.UUID) private UUID id;
    private UUID clinicId;
    private UUID invoiceId;
    private UUID sourceItemId;
    private boolean active = true;
}
