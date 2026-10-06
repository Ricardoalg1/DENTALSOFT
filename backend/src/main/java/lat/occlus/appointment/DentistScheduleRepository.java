package lat.occlus.appointment;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DentistScheduleRepository extends JpaRepository<DentistSchedule, UUID> {

    List<DentistSchedule> findByClinicIdOrderByDentistIdAscDayOfWeekAscStartTimeAsc(UUID clinicId);

    List<DentistSchedule> findByClinicIdAndDentistId(UUID clinicId, UUID dentistId);

    void deleteByClinicIdAndDentistId(UUID clinicId, UUID dentistId);
}
