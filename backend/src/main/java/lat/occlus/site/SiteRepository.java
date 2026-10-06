package lat.occlus.site;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SiteRepository extends JpaRepository<Site, UUID> {

    List<Site> findByClinicIdOrderByName(UUID clinicId);
}
