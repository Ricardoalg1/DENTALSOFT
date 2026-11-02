package lat.occlus.patient;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface PatientRepository extends JpaRepository<Patient, UUID>, JpaSpecificationExecutor<Patient> {

    Optional<Patient> findByIdAndClinicId(UUID id, UUID clinicId);

    boolean existsByClinicIdAndDocumentTypeAndDocumentNumber(UUID clinicId, DocumentType type, String number);

    /** Para la migración: busca de una vez los pacientes de una parte del archivo. */
    List<Patient> findByClinicIdAndDocumentNumberIn(UUID clinicId, Collection<String> numbers);
}
