package lat.occlus.appointment;

import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import lat.occlus.appointment.AgendaDtos.ScheduleBlock;
import lat.occlus.appointment.AgendaDtos.ScheduleResponse;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.NotFoundException;
import lat.occlus.site.SiteRepository;
import lat.occlus.user.AppUserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ScheduleService {

    private final DentistScheduleRepository schedules;
    private final AppUserRepository users;
    private final SiteRepository sites;

    @Transactional(readOnly = true)
    public List<ScheduleResponse> list(UUID clinicId) {
        return schedules.findByClinicIdOrderByDentistIdAscDayOfWeekAscStartTimeAsc(clinicId).stream()
                .map(ScheduleService::toResponse)
                .toList();
    }

    /** Reemplaza el horario semanal completo del profesional. */
    @Transactional
    public List<ScheduleResponse> replace(UUID clinicId, UUID dentistId, List<ScheduleBlock> blocks) {
        var dentist = users.findByIdAndClinicId(dentistId, clinicId)
                .orElseThrow(() -> new NotFoundException("Profesional no encontrado"));
        if (!dentist.isProfessional()) throw new BadRequestException("El usuario no está marcado como profesional");

        var sorted = blocks.stream()
                .sorted(Comparator.comparing(ScheduleBlock::dayOfWeek).thenComparing(ScheduleBlock::startTime))
                .toList();
        for (int i = 0; i < sorted.size(); i++) {
            var b = sorted.get(i);
            if (!b.endTime().isAfter(b.startTime())) {
                throw new BadRequestException("La hora final debe ser posterior a la inicial");
            }
            if (sites.findById(b.siteId()).filter(s -> s.getClinicId().equals(clinicId)).isEmpty()) {
                throw new BadRequestException("Sede no válida");
            }
            // Un profesional no puede estar en dos bloques a la vez (ni en dos sedes).
            if (i > 0 && sorted.get(i - 1).dayOfWeek().equals(b.dayOfWeek())
                    && sorted.get(i - 1).endTime().isAfter(b.startTime())) {
                throw new BadRequestException("Hay bloques de horario que se cruzan el mismo día");
            }
        }

        schedules.deleteByClinicIdAndDentistId(clinicId, dentistId);
        schedules.flush();
        var saved = schedules.saveAll(sorted.stream().map(b -> {
            var s = new DentistSchedule();
            s.setClinicId(clinicId);
            s.setDentistId(dentistId);
            s.setSiteId(b.siteId());
            s.setDayOfWeek(b.dayOfWeek().shortValue());
            s.setStartTime(b.startTime());
            s.setEndTime(b.endTime());
            return s;
        }).toList());
        return saved.stream().map(ScheduleService::toResponse).toList();
    }

    /**
     * Si el profesional tiene horario configurado, la cita debe caber completa en un bloque de ese día
     * y esa sede. Sin horario configurado no se restringe (útil al empezar a usar el sistema).
     */
    void ensureWithinSchedule(UUID clinicId, UUID dentistId, UUID siteId, ZonedDateTime start, ZonedDateTime end) {
        if (!start.toLocalDate().equals(end.toLocalDate()) && !end.toLocalTime().equals(LocalTime.MIDNIGHT)) {
            throw new BadRequestException("La cita debe empezar y terminar el mismo día");
        }
        var blocks = schedules.findByClinicIdAndDentistId(clinicId, dentistId);
        if (blocks.isEmpty()) return;
        LocalTime from = start.toLocalTime();
        LocalTime to = end.toLocalTime().equals(LocalTime.MIDNIGHT) ? LocalTime.MAX : end.toLocalTime();
        boolean fits = blocks.stream().anyMatch(b -> b.getSiteId().equals(siteId)
                && b.getDayOfWeek() == start.getDayOfWeek().getValue()
                && !from.isBefore(b.getStartTime())
                && !to.isAfter(b.getEndTime()));
        if (!fits) throw new BadRequestException("Fuera del horario de atención del profesional en esa sede");
    }

    private static ScheduleResponse toResponse(DentistSchedule s) {
        return new ScheduleResponse(s.getDentistId(), s.getSiteId(), s.getDayOfWeek(), s.getStartTime(), s.getEndTime());
    }
}
