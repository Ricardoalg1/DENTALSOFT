package lat.occlus.treatment;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TreatmentTypeRepository extends JpaRepository<TreatmentType, UUID> {

    Optional<TreatmentType> findByIdAndClinicId(UUID id, UUID clinicId);

    List<TreatmentType> findByClinicIdOrderByNameAsc(UUID clinicId);

    Optional<TreatmentType> findByClinicIdAndNameIgnoreCase(UUID clinicId, String name);
}
