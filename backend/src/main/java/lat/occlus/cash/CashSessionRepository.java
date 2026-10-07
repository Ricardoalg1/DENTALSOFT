package lat.occlus.cash;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CashSessionRepository extends JpaRepository<CashSession, UUID> {

    Optional<CashSession> findByIdAndClinicId(UUID id, UUID clinicId);

    Optional<CashSession> findByClinicIdAndSiteIdAndClosedAtIsNull(UUID clinicId, UUID siteId);

    List<CashSession> findByClinicIdOrderByOpenedAtDesc(UUID clinicId, Limit limit);
}
