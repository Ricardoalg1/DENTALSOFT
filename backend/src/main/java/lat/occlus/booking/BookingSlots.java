package lat.occlus.booking;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import lat.occlus.appointment.DentistScheduleRepository;
import lat.occlus.booking.BookingDtos.Slot;
import lat.occlus.site.SiteRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Horas libres de un profesional: su horario, menos ausencias, citas y solicitudes activas. Las consultas leen
 * solo horas, nunca a quién pertenecen. Debe llamarse con el contexto de la clínica ya fijado.
 */
@Component
@RequiredArgsConstructor
class BookingSlots {

    static final ZoneId BOGOTA = ZoneId.of("America/Bogota");
    static final int PAGE_DAYS = 7;

    private record Block(int day, LocalTime start, LocalTime end, UUID siteId, String siteName) {}
    private record Off(LocalDate from, LocalDate to, LocalTime start, LocalTime end) {}
    private record Busy(Instant start, Instant end) {}

    private final JdbcTemplate db;
    private final DentistScheduleRepository schedules;
    private final SiteRepository sites;

    List<Slot> free(UUID clinicId, BookingSettings s, UUID dentistId, LocalDate from) {
        LocalDate today = LocalDate.now(BOGOTA);
        LocalDate first = from.isBefore(today) ? today : from;
        LocalDate lastAllowed = today.plusDays(s.maxDaysAhead());
        LocalDate last = first.plusDays(PAGE_DAYS - 1L).isAfter(lastAllowed) ? lastAllowed : first.plusDays(PAGE_DAYS - 1L);
        if (last.isBefore(first)) return List.of();

        // Por el repositorio, no con SQL: JPA convierte estas horas con la zona de la conexión al guardarlas.
        var siteNames = new java.util.HashMap<UUID, String>();
        sites.findAll().stream().filter(st -> st.getClinicId().equals(clinicId) && st.isActive()).forEach(st -> siteNames.put(st.getId(), st.getName()));
        var blocks = schedules.findByClinicIdAndDentistId(clinicId, dentistId).stream()
                .filter(b -> siteNames.containsKey(b.getSiteId()))
                .map(b -> new Block(b.getDayOfWeek(), b.getStartTime(), b.getEndTime(), b.getSiteId(), siteNames.get(b.getSiteId())))
                .toList();
        var timeOff = db.query("""
                select from_date, to_date, start_time, end_time from dentist_time_off
                where clinic_id = ? and dentist_id = ? and from_date <= ? and to_date >= ?""",
                (rs, i) -> new Off(rs.getObject(1, LocalDate.class), rs.getObject(2, LocalDate.class),
                        rs.getObject(3, LocalTime.class), rs.getObject(4, LocalTime.class)), clinicId, dentistId, last, first);
        Timestamp rangeStart = Timestamp.from(first.atStartOfDay(BOGOTA).toInstant());
        Timestamp rangeEnd = Timestamp.from(last.plusDays(1).atStartOfDay(BOGOTA).toInstant());
        var busy = db.query("""
                select starts_at, ends_at from appointment
                where dentist_id = ? and status <> 'CANCELLED' and starts_at < ? and ends_at > ?
                union all
                select starts_at, ends_at from online_booking_request
                where dentist_id = ? and starts_at < ? and ends_at > ?
                  and (status = 'PENDING' or (status = 'HOLD' and hold_expires_at > now()))""",
                (rs, i) -> new Busy(rs.getTimestamp(1).toInstant(), rs.getTimestamp(2).toInstant()),
                dentistId, rangeEnd, rangeStart, dentistId, rangeEnd, rangeStart);

        Instant earliest = Instant.now().plusSeconds(s.minNoticeHours() * 3600L);
        var slots = new ArrayList<Slot>();
        for (LocalDate day = first; !day.isAfter(last); day = day.plusDays(1)) {
            for (Block b : blocks) {
                if (b.day() != day.getDayOfWeek().getValue()) continue;
                for (LocalTime t = b.start(); !t.plusMinutes(s.durationMinutes()).isAfter(b.end()) && !t.plusMinutes(s.durationMinutes()).isBefore(t);
                     t = t.plusMinutes(s.durationMinutes())) {
                    LocalTime end = t.plusMinutes(s.durationMinutes());
                    var startsAt = day.atTime(t).atZone(BOGOTA);
                    Instant startI = startsAt.toInstant();
                    Instant endI = startI.plusSeconds(s.durationMinutes() * 60L);
                    if (startI.isBefore(earliest) || blockedByTimeOff(timeOff, day, t, end)) continue;
                    if (busy.stream().anyMatch(x -> x.start().isBefore(endI) && x.end().isAfter(startI))) continue;
                    slots.add(new Slot(startsAt.toOffsetDateTime(), b.siteId(), b.siteName()));
                }
            }
        }
        slots.sort(Comparator.comparing(Slot::startsAt));
        return slots;
    }

    private static boolean blockedByTimeOff(List<Off> items, LocalDate day, LocalTime start, LocalTime end) {
        return items.stream().anyMatch(o -> !day.isBefore(o.from()) && !day.isAfter(o.to())
                && (o.start() == null || (o.start().isBefore(end) && o.end().isAfter(start))));
    }
}
