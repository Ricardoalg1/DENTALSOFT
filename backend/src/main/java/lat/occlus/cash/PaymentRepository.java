package lat.occlus.cash;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface PaymentRepository extends JpaRepository<Payment, UUID> {

    Optional<Payment> findByIdAndClinicId(UUID id, UUID clinicId);

    List<Payment> findByClinicIdAndPatientIdOrderByReceivedAtDesc(UUID clinicId, UUID patientId);

    List<Payment> findByCashSessionIdOrderByReceivedAtAsc(UUID cashSessionId);

    @Query("""
            select coalesce(sum(p.amount), 0) from Payment p
            where p.clinicId = :clinicId and p.patientId = :patientId and p.voidedAt is null""")
    BigDecimal sumPaid(UUID clinicId, UUID patientId);
}
