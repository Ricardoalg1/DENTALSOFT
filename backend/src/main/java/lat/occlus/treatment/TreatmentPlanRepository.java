package lat.occlus.treatment;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TreatmentPlanRepository extends JpaRepository<TreatmentPlan, UUID> {

    List<TreatmentPlan> findByClinicIdAndPatientIdOrderByCreatedAtDesc(UUID clinicId, UUID patientId);

    Optional<TreatmentPlan> findByIdAndClinicId(UUID id, UUID clinicId);
}
