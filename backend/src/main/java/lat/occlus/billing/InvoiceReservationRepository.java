package lat.occlus.billing;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.*;

public interface InvoiceReservationRepository extends JpaRepository<InvoiceReservation,UUID> {
    @Query("select r.sourceItemId from InvoiceReservation r join BillingInvoice b on b.id=r.invoiceId where b.clinicId=:clinicId and b.patientId=:patientId and r.active=true")
    List<UUID> reservedItems(UUID clinicId, UUID patientId);
    List<InvoiceReservation> findByInvoiceId(UUID invoiceId);
}
