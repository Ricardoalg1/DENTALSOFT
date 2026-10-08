package lat.occlus.cash;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import jakarta.persistence.LockModeType;

public interface CashSessionRepository extends JpaRepository<CashSession, UUID> {

    Optional<CashSession> findByIdAndClinicId(UUID id, UUID clinicId);

    Optional<CashSession> findByClinicIdAndSiteIdAndClosedAtIsNull(UUID clinicId, UUID siteId);

    List<CashSession> findByClinicIdOrderByOpenedAtDesc(UUID clinicId, Limit limit);

    List<CashSession> findByClinicIdAndClosedAtIsNullOrderByOpenedAtDesc(UUID clinicId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from CashSession s where s.id = :id and s.clinicId = :clinicId")
    Optional<CashSession> findLocked(UUID clinicId, UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from CashSession s where s.clinicId = :clinicId and s.siteId = :siteId and s.closedAt is null")
    Optional<CashSession> findOpenLocked(UUID clinicId, UUID siteId);
}
