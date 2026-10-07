package lat.occlus.clinical;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ConsentTemplateRepository extends JpaRepository<ConsentTemplate, UUID> {

    List<ConsentTemplate> findByClinicIdOrderByTitle(UUID clinicId);

    Optional<ConsentTemplate> findByIdAndClinicId(UUID id, UUID clinicId);

    boolean existsByClinicIdAndTitle(UUID clinicId, String title);
}
