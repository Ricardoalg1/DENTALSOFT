package lat.occlus.billing;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BillingProfileRepository extends JpaRepository<BillingProfile,UUID> {}
