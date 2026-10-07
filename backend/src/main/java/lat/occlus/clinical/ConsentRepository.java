package lat.occlus.clinical;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ConsentRepository extends JpaRepository<Consent, UUID> {

    List<Consent> findByClinicIdAndPatientIdOrderBySignedAtDesc(UUID clinicId, UUID patientId);

    Optional<Consent> findByIdAndClinicId(UUID id, UUID clinicId);
}
