package lat.occlus.cash;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentItemRepository extends JpaRepository<PaymentItem, UUID> {

    List<PaymentItem> findByPaymentIdInOrderByPosition(Collection<UUID> paymentIds);
}
