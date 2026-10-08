package lat.occlus.billing;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.*;

public interface BillingInvoiceRepository extends JpaRepository<BillingInvoice,UUID> {
    Optional<BillingInvoice> findByIdAndClinicId(UUID id, UUID clinicId);
    List<BillingInvoice> findByClinicIdOrderByCreatedAtDesc(UUID clinicId, Limit limit);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select b from BillingInvoice b where b.id=:id and b.clinicId=:clinicId")
    Optional<BillingInvoice> findLocked(UUID clinicId, UUID id);
}
