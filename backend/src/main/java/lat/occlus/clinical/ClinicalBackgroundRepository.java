package lat.occlus.clinical;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClinicalBackgroundRepository extends JpaRepository<ClinicalBackground, UUID> {

    Optional<ClinicalBackground> findByClinicIdAndPatientId(UUID clinicId, UUID patientId);
}
