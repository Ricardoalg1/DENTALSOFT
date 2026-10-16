package lat.occlus.cash;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface FinancingRepository extends JpaRepository<Financing, UUID> {

    Optional<Financing> findByIdAndClinicId(UUID id, UUID clinicId);

    List<Financing> findByClinicIdAndPatientIdOrderByCreatedAtDesc(UUID clinicId, UUID patientId);

    List<Financing> findByClinicIdOrderByCreatedAtDesc(UUID clinicId, org.springframework.data.domain.Limit limit);

    /** Pagado por financiamiento (abonos no anulados). */
    @Query("""
            select p.financingId, coalesce(sum(p.amount), 0) from Payment p
            where p.financingId in :ids and p.voidedAt is null group by p.financingId""")
    List<Object[]> paidByFinancing(Collection<UUID> ids);
}
