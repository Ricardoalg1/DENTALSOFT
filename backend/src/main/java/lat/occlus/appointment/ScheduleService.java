package lat.occlus.appointment;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import lat.occlus.appointment.AgendaDtos.ScheduleBlock;
import lat.occlus.appointment.AgendaDtos.ScheduleResponse;
import lat.occlus.appointment.AgendaDtos.TimeOffBlock;
import lat.occlus.appointment.AgendaDtos.TimeOffResponse;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.NotFoundException;
import lat.occlus.site.SiteRepository;
import lat.occlus.user.AppUserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ScheduleService {

    private final DentistScheduleRepository schedules;
    private final AppUserRepository users;
    private final SiteRepository sites;
    private final JdbcTemplate db;

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
        ensureNotTimeOff(clinicId, dentistId, start, end);
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

    // ---------- Ausencias ----------

    @Transactional(readOnly = true)
    public List<TimeOffResponse> listTimeOff(UUID clinicId) {
        return db.query("""
                select dentist_id, from_date, to_date, start_time, end_time, reason from dentist_time_off
                where clinic_id = ? order by dentist_id, from_date, start_time nulls first""",
                (rs, i) -> new TimeOffResponse(rs.getObject("dentist_id", UUID.class),
                        rs.getObject("from_date", LocalDate.class), rs.getObject("to_date", LocalDate.class),
                        rs.getObject("start_time", LocalTime.class), rs.getObject("end_time", LocalTime.class),
                        rs.getString("reason")), clinicId);
    }

    /** Reemplaza todas las ausencias del profesional. */
    @Transactional
    public List<TimeOffResponse> replaceTimeOff(UUID clinicId, UUID dentistId, List<TimeOffBlock> items) {
        var dentist = users.findByIdAndClinicId(dentistId, clinicId)
                .orElseThrow(() -> new NotFoundException("Profesional no encontrado"));
        if (!dentist.isProfessional()) throw new BadRequestException("El usuario no está marcado como profesional");
        for (var b : items) {
            if (b.toDate().isBefore(b.fromDate())) throw new BadRequestException("La fecha final debe ser igual o posterior a la inicial");
            if ((b.startTime() == null) != (b.endTime() == null)) throw new BadRequestException("Indica la hora inicial y la final, o ninguna para todo el día");
            if (b.startTime() != null && !b.endTime().isAfter(b.startTime())) throw new BadRequestException("La hora final debe ser posterior a la inicial");
        }
        db.update("delete from dentist_time_off where clinic_id = ? and dentist_id = ?", clinicId, dentistId);
        for (var b : items) {
            db.update("""
                    insert into dentist_time_off (id, clinic_id, dentist_id, from_date, to_date, start_time, end_time, reason)
                    values (?, ?, ?, ?, ?, ?, ?, ?)""", UUID.randomUUID(), clinicId, dentistId, b.fromDate(), b.toDate(),
                    b.startTime(), b.endTime(), b.reason() == null ? "" : b.reason().trim());
        }
        return listTimeOff(clinicId).stream().filter(t -> t.dentistId().equals(dentistId)).toList();
    }

    /** La cita no puede caer en un día o franja en que el profesional no atiende. */
    private void ensureNotTimeOff(UUID clinicId, UUID dentistId, ZonedDateTime start, ZonedDateTime end) {
        LocalDate day = start.toLocalDate();
        LocalTime from = start.toLocalTime();
        LocalTime to = end.toLocalTime().equals(LocalTime.MIDNIGHT) ? LocalTime.MAX : end.toLocalTime();
        var hit = db.query("""
                select reason from dentist_time_off
                where clinic_id = ? and dentist_id = ? and ? between from_date and to_date
                  and (start_time is null or (start_time < ? and end_time > ?)) limit 1""",
                (rs, i) -> rs.getString("reason"), clinicId, dentistId, day, to, from);
        if (!hit.isEmpty()) {
            var reason = hit.getFirst();
            throw new BadRequestException("El profesional no atiende en esa fecha u hora" + (reason.isBlank() ? "" : " (" + reason + ")"));
        }
    }

    private static ScheduleResponse toResponse(DentistSchedule s) {
        return new ScheduleResponse(s.getDentistId(), s.getSiteId(), s.getDayOfWeek(), s.getStartTime(), s.getEndTime());
    }
}
