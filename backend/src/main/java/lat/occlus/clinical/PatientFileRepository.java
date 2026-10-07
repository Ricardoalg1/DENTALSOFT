package lat.occlus.clinical;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PatientFileRepository extends JpaRepository<PatientFile, UUID> {

    Optional<PatientFile> findByIdAndClinicId(UUID id, UUID clinicId);

    List<PatientFile> findByClinicIdAndPatientIdAndCategoryNotAndRemovedAtIsNullOrderByCreatedAtDesc(
            UUID clinicId, UUID patientId, FileCategory excluded);
}
