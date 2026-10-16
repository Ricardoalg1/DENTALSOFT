package lat.occlus.cash;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FinancingInstallmentRepository extends JpaRepository<FinancingInstallment, UUID> {

    List<FinancingInstallment> findByFinancingIdInOrderByNumber(Collection<UUID> financingIds);
}
