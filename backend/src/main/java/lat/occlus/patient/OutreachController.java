package lat.occlus.patient;

import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Seguimiento de pacientes: próximos cumpleaños y pacientes que llevan tiempo sin venir. Solo administración y recepción. */
@RestController
@RequestMapping("/api/outreach")
@PreAuthorize("hasAnyRole('ADMIN','RECEPTION')")
@RequiredArgsConstructor
public class OutreachController {

    public record Birthday(java.util.UUID id, String fullName, String phone, LocalDate birthDate, LocalDate nextBirthday, int turning) {}

    public record Inactive(java.util.UUID id, String fullName, String phone, LocalDate lastVisit, long monthsAway) {}

    private static final String NAME = "p.first_name || coalesce(' ' || p.middle_name, '') || ' ' || p.first_last_name || coalesce(' ' || p.second_last_name, '')";

    private final JdbcTemplate db;

    /** Cumpleaños desde hoy hasta dentro de {@code days} días (la fecha se interpreta en hora de Colombia). */
    @GetMapping("/birthdays")
    @Transactional(readOnly = true)
    public List<Birthday> birthdays(@RequestParam(defaultValue = "14") int days) {
        int range = Math.clamp(days, 1, 90);
        return db.query("""
                select id, full_name, phone, birth_date, next_bd,
                       (extract(year from next_bd) - extract(year from birth_date))::int as turning
                from (
                  select id, full_name, phone, birth_date,
                         case when d0 < today then (d0 + interval '1 year')::date else d0 end as next_bd
                  from (
                    select p.id, %s as full_name, p.phone, p.birth_date,
                           (p.birth_date + make_interval(years => extract(year from today)::int - extract(year from p.birth_date)::int))::date as d0,
                           today
                    from patient p, (select (now() at time zone 'America/Bogota')::date as today) t
                    where p.active
                  ) x
                ) y
                where next_bd <= today_plus(?)
                order by next_bd, full_name limit 300""".formatted(NAME).replace("today_plus(?)", "(now() at time zone 'America/Bogota')::date + ?"),
                (rs, i) -> new Birthday(rs.getObject("id", java.util.UUID.class), rs.getString("full_name"), rs.getString("phone"),
                        rs.getObject("birth_date", LocalDate.class), rs.getObject("next_bd", LocalDate.class), rs.getInt("turning")),
                range);
    }

    /** Pacientes activos cuya última atención fue hace más de {@code months} meses y que no tienen cita próxima. */
    @GetMapping("/inactive")
    @Transactional(readOnly = true)
    public List<Inactive> inactive(@RequestParam(defaultValue = "6") int months) {
        int range = Math.clamp(months, 1, 60);
        return db.query("""
                select p.id, %s as full_name, p.phone, v.last_visit,
                       (extract(year from age(now(), v.last_visit)) * 12 + extract(month from age(now(), v.last_visit)))::bigint as months_away
                from patient p
                join (select patient_id, max(starts_at at time zone 'America/Bogota')::date as last_visit
                      from appointment where status = 'ATTENDED' group by patient_id) v on v.patient_id = p.id
                where p.active
                  and v.last_visit < ((now() at time zone 'America/Bogota')::date - make_interval(months => ?))
                  and not exists (select 1 from appointment a where a.patient_id = p.id
                                  and a.status in ('SCHEDULED', 'CONFIRMED') and a.starts_at > now())
                order by v.last_visit limit 300""".formatted(NAME),
                (rs, i) -> new Inactive(rs.getObject("id", java.util.UUID.class), rs.getString("full_name"), rs.getString("phone"),
                        rs.getObject("last_visit", LocalDate.class), rs.getLong("months_away")),
                range);
    }
}
