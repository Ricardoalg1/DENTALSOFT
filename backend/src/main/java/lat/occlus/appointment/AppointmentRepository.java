package lat.occlus.appointment;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;

public interface AppointmentRepository extends JpaRepository<Appointment, UUID>, JpaSpecificationExecutor<Appointment> {

    Optional<Appointment> findByIdAndClinicId(UUID id, UUID clinicId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from Appointment a where a.id=:id and a.clinicId=:clinicId")
    Optional<Appointment> findForWrite(UUID id, UUID clinicId);

    List<Appointment> findByClinicIdAndPatientIdOrderByStartsAtDesc(UUID clinicId, UUID patientId, Limit limit);

    /** ¿El profesional tiene otra cita activa que se cruce con [start, end)? */
    @Query("""
            select count(a) > 0 from Appointment a
            where a.dentistId = :dentistId
              and a.status <> :cancelled
              and a.startsAt < :end and a.endsAt > :start
              and a.id <> :excludeId""")
    boolean existsOverlap(UUID dentistId, Instant start, Instant end, UUID excludeId, AppointmentStatus cancelled);
}
