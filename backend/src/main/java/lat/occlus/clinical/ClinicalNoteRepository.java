package lat.occlus.clinical;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClinicalNoteRepository extends JpaRepository<ClinicalNote, UUID> {

    Optional<ClinicalNote> findByIdAndClinicId(UUID id, UUID clinicId);

    List<ClinicalNote> findByClinicIdAndPatientIdOrderByAttendedAtDesc(UUID clinicId, UUID patientId, Limit limit);

    /** Borradores pendientes de firma de un profesional. */
    List<ClinicalNote> findByClinicIdAndDentistIdAndSignedAtIsNullOrderByAttendedAtDesc(UUID clinicId, UUID dentistId);

    List<ClinicalNote> findByClinicIdAndSignedAtIsNotNullOrderBySignedAtDesc(UUID clinicId, Limit limit);

    boolean existsByAppointmentId(UUID appointmentId);
}
