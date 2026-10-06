package lat.occlus.patient;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface PatientRepository extends JpaRepository<Patient, UUID>, JpaSpecificationExecutor<Patient> {

    Optional<Patient> findByIdAndClinicId(UUID id, UUID clinicId);

    boolean existsByClinicIdAndDocumentTypeAndDocumentNumber(UUID clinicId, DocumentType type, String number);
}
