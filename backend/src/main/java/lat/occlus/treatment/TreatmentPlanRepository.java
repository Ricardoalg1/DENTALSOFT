package lat.occlus.treatment;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import jakarta.persistence.LockModeType;

public interface TreatmentPlanRepository extends JpaRepository<TreatmentPlan, UUID> {

    List<TreatmentPlan> findByClinicIdAndPatientIdOrderByCreatedAtDesc(UUID clinicId, UUID patientId);

    Optional<TreatmentPlan> findByIdAndClinicId(UUID id, UUID clinicId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from TreatmentPlan p where p.id=:id and p.clinicId=:clinicId")
    Optional<TreatmentPlan> findLocked(UUID clinicId, UUID id);
}
