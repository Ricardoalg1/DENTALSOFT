package lat.occlus.treatment;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProcedureRepository extends JpaRepository<Procedure, UUID> {

    List<Procedure> findByClinicIdOrderByCategoryAscNameAsc(UUID clinicId);

    Optional<Procedure> findByIdAndClinicId(UUID id, UUID clinicId);

    boolean existsByClinicIdAndName(UUID clinicId, String name);

    boolean existsByClinicIdAndNameAndIdNot(UUID clinicId, String name, UUID id);
}
