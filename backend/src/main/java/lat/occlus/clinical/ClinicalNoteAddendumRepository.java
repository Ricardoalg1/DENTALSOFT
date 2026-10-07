package lat.occlus.clinical;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClinicalNoteAddendumRepository extends JpaRepository<ClinicalNoteAddendum, UUID> {

    List<ClinicalNoteAddendum> findByNoteIdInOrderByCreatedAt(Collection<UUID> noteIds);
}
