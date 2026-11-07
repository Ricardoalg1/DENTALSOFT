package lat.occlus.booking;

import java.sql.Timestamp;
import java.text.Normalizer;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import lat.occlus.appointment.AgendaDtos.AppointmentRequest;
import lat.occlus.appointment.AppointmentService;
import lat.occlus.appointment.VisitType;
import lat.occlus.auth.Email;
import lat.occlus.auth.MailTransport;
import lat.occlus.booking.BookingDtos.PatientMatch;
import lat.occlus.booking.BookingDtos.Ref;
import lat.occlus.booking.BookingDtos.RequestView;
import lat.occlus.booking.BookingDtos.SettingsRequest;
import lat.occlus.booking.BookingDtos.SettingsResponse;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.ConflictException;
import lat.occlus.shared.web.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** El lado de la clínica: configurar la página y decidir cada solicitud. Solo aquí nace una cita. */
@Service
@RequiredArgsConstructor
public class BookingAdminService {

    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    private final AppointmentService appointments;
    private final BookingNotifier notifier;
    private final BookingProperties props;
    private final MailTransport mail;

    // ---------- Configuración ----------

    public SettingsResponse settings(UUID clinicId) {
        return tx.execute(t -> {
            var rows = db.query("select " + BookingSettings.COLUMNS + " from online_booking_settings where clinic_id = ?", BookingSettings::map, clinicId);
            if (!rows.isEmpty()) return view(rows.getFirst());
            // Aún sin guardar: se propone una dirección a partir del nombre de la clínica.
            String name = db.queryForObject("select name from clinic where id = ?", String.class, clinicId);
            return view(new BookingSettings(clinicId, slugFrom(name), false, List.of(VisitType.FIRST_VISIT, VisitType.CONTROL), List.of(), 30, 4, 30));
        });
    }

    public SettingsResponse save(UUID clinicId, SettingsRequest req) {
        if (req.enabled() && (req.visitTypes().isEmpty() || req.dentistIds().isEmpty())) {
            throw new BadRequestException("Elige al menos un tipo de cita y un profesional para activar la página.");
        }
        try {
            return tx.execute(t -> {
                for (UUID id : req.dentistIds()) {
                    Integer ok = db.queryForObject("select count(*) from app_user where id = ? and clinic_id = ? and active and professional", Integer.class, id, clinicId);
                    if (ok == null || ok == 0) throw new BadRequestException("Profesional no válido");
                    Integer blocks = db.queryForObject("select count(*) from dentist_schedule where dentist_id = ? and clinic_id = ?", Integer.class, id, clinicId);
                    if (req.enabled() && (blocks == null || blocks == 0)) {
                        throw new BadRequestException("Hay profesionales sin horario de atención. Configúralo antes de activar la página.");
                    }
                }
                String types = String.join(",", req.visitTypes().stream().distinct().map(Enum::name).toList());
                String dentists = String.join(",", req.dentistIds().stream().distinct().map(UUID::toString).toList());
                db.update("""
                        insert into online_booking_settings (clinic_id, slug, enabled, visit_types, dentist_ids, duration_minutes, min_notice_hours, max_days_ahead)
                        values (?, ?, ?, string_to_array(?, ','), string_to_array(?, ',')::uuid[], ?, ?, ?)
                        on conflict (clinic_id) do update set slug = excluded.slug, enabled = excluded.enabled, visit_types = excluded.visit_types,
                            dentist_ids = excluded.dentist_ids, duration_minutes = excluded.duration_minutes, min_notice_hours = excluded.min_notice_hours,
                            max_days_ahead = excluded.max_days_ahead, updated_at = now()""",
                        clinicId, req.slug(), req.enabled(), types, dentists, req.durationMinutes(), req.minNoticeHours(), req.maxDaysAhead());
                return view(db.queryForObject("select " + BookingSettings.COLUMNS + " from online_booking_settings where clinic_id = ?", BookingSettings::map, clinicId));
            });
        } catch (DuplicateKeyException e) {
            throw new ConflictException("Esa dirección ya la usa otra clínica. Elige otra.");
        }
    }

    private SettingsResponse view(BookingSettings s) {
        return new SettingsResponse(s.enabled(), s.slug(), s.visitTypes(), s.dentistIds(), s.durationMinutes(), s.minNoticeHours(),
                s.maxDaysAhead(), props.baseUrl() + "/reservar/" + s.slug(),
                props.captchaConfigured() || !props.captchaRequired(), mail.configured());
    }

    static String slugFrom(String name) {
        String ascii = Normalizer.normalize(name, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT);
        String slug = ascii.replaceAll("[^a-z0-9]+", "-").replaceAll("(^-+|-+$)", "");
        if (slug.length() > 60) slug = slug.substring(0, 60).replaceAll("-+$", "");
        return slug.length() < 3 ? "clinica-" + slug : slug;
    }

    // ---------- Bandeja ----------

    public List<RequestView> pending(UUID clinicId) {
        return tx.execute(t -> query(clinicId, "r.status = 'PENDING' and r.starts_at > now() order by r.starts_at"));
    }

    public RequestView get(UUID clinicId, UUID id) {
        return tx.execute(t -> {
            var rows = query(clinicId, "r.id = '" + id + "' and r.status = 'PENDING'");
            if (rows.isEmpty()) throw new NotFoundException("Solicitud no encontrada");
            return rows.getFirst();
        });
    }

    public int pendingCount(UUID clinicId) {
        Integer n = db.queryForObject("select count(*) from online_booking_request where clinic_id = ? and status = 'PENDING' and starts_at > now()", Integer.class, clinicId);
        return n == null ? 0 : n;
    }

    private record Decision(String channel, String target, String clinic, OffsetDateTime startsAt, String dentist, String site) {}

    /** La cita y la solicitud cambian juntas. Si otra cita ocupó la hora, la restricción de la agenda lo impide. */
    public void confirm(AuthUser me, UUID id, UUID patientId) {
        var d = tx.execute(t -> {
            var rows = db.query("""
                    select dentist_id, site_id, starts_at, ends_at, visit_type, channel, verify_target from online_booking_request
                    where id = ? and clinic_id = ? and status = 'PENDING' and starts_at > now() for update""",
                    (rs, i) -> new Object[] {rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getTimestamp(3), rs.getTimestamp(4),
                            rs.getString(5), rs.getString(6), rs.getString(7)}, id, me.clinicId());
            if (rows.isEmpty()) throw new NotFoundException("Solicitud no encontrada o ya resuelta");
            var r = rows.getFirst();
            var starts = ((Timestamp) r[2]).toInstant();
            int minutes = (int) java.time.Duration.between(starts, ((Timestamp) r[3]).toInstant()).toMinutes();
            var appointment = appointments.create(me.clinicId(), me.userId(), new AppointmentRequest(patientId, (UUID) r[0], (UUID) r[1],
                    starts.atZone(BookingSlots.BOGOTA).toOffsetDateTime(), minutes, VisitType.valueOf((String) r[4]), null, "Reserva en línea"));
            db.update("""
                    update online_booking_request set status = 'CONFIRMED', appointment_id = ?, patient_id = ?, decided_by = ?, decided_at = now() where id = ?""",
                    appointment.id(), patientId, me.userId(), id);
            return new Decision((String) r[5], (String) r[6], clinicName(me.clinicId()), appointment.startsAt(), appointment.dentist().name(), appointment.site().name());
        });
        notifier.notice(d.channel(), d.target(), "Tu cita en " + d.clinic() + " está confirmada",
                Email.titled("¡Tu cita está confirmada!").eyebrow(d.clinic())
                        .line("Te esperamos. Si no puedes asistir, usa el enlace que te enviamos al reservar.")
                        .detail("Cuándo", PublicDates.format(d.startsAt())).detail("Profesional", d.dentist()).detail("Sede", d.site()), d.clinic());
    }

    public void reject(AuthUser me, UUID id, String reason) {
        String clean = reason == null || reason.isBlank() ? null : reason.strip();
        var d = tx.execute(t -> {
            var rows = db.query("select channel, verify_target from online_booking_request where id = ? and clinic_id = ? and status = 'PENDING' for update",
                    (rs, i) -> new String[] {rs.getString(1), rs.getString(2)}, id, me.clinicId());
            if (rows.isEmpty()) throw new NotFoundException("Solicitud no encontrada o ya resuelta");
            db.update("""
                    update online_booking_request set status = 'REJECTED', manage_token_hash = null, decided_by = ?, decided_at = now(), decision_reason = ? where id = ?""",
                    me.userId(), clean, id);
            return new Decision(rows.getFirst()[0], rows.getFirst()[1], clinicName(me.clinicId()), null, null, null);
        });
        notifier.notice(d.channel(), d.target(), "Sobre tu solicitud de cita en " + d.clinic(),
                Email.titled("No pudimos confirmar tu hora").eyebrow(d.clinic())
                        .line("La clínica no pudo confirmar la hora que pediste. Puedes reservar otra o llamar a la clínica.")
                        .detail("Motivo", clean), d.clinic());
    }

    private List<RequestView> query(UUID clinicId, String where) {
        var views = new ArrayList<RequestView>();
        db.query("""
                select r.id, r.starts_at, r.ends_at, r.visit_type, r.full_name, r.phone, r.email, r.channel, r.dentist_id, u.full_name as dentist,
                       r.site_id, st.name as site, r.patient_id
                from online_booking_request r join app_user u on u.id = r.dentist_id join site st on st.id = r.site_id
                where r.clinic_id = ? and """ + " " + where, rs -> {
            views.add(new RequestView(rs.getObject("id", UUID.class),
                    rs.getTimestamp("starts_at").toInstant().atZone(BookingSlots.BOGOTA).toOffsetDateTime(),
                    rs.getTimestamp("ends_at").toInstant().atZone(BookingSlots.BOGOTA).toOffsetDateTime(),
                    VisitType.valueOf(rs.getString("visit_type")).label(), rs.getString("full_name"), rs.getString("phone"), rs.getString("email"),
                    rs.getString("channel"), new Ref(rs.getObject("dentist_id", UUID.class), rs.getString("dentist")),
                    new Ref(rs.getObject("site_id", UUID.class), rs.getString("site")), rs.getObject("patient_id", UUID.class), List.of()));
        }, clinicId);
        return views.stream().map(v -> new RequestView(v.id(), v.startsAt(), v.endsAt(), v.visitType(), v.fullName(), v.phone(), v.email(),
                v.verifiedChannel(), v.dentist(), v.site(), v.patientId(), matches(clinicId, v.phone(), v.email()))).toList();
    }

    /** Solo la clínica ve estas coincidencias, para evitar duplicados. Es una ayuda: la decisión es de recepción. */
    private List<PatientMatch> matches(UUID clinicId, String phone, String email) {
        String digits = phone == null ? "" : phone.replaceAll("\\D", "");
        String last10 = digits.length() > 10 ? digits.substring(digits.length() - 10) : digits;
        return db.query("""
                select id, concat_ws(' ', first_name, first_last_name, second_last_name) as name, document_type || ' ' || document_number as doc
                from patient where clinic_id = ? and active
                  and (lower(email) = ? or (? <> '' and right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = ?)) limit 3""",
                (rs, i) -> new PatientMatch(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("doc")),
                clinicId, email == null ? "" : email.toLowerCase(Locale.ROOT), last10, last10);
    }

    private String clinicName(UUID clinicId) {
        return db.queryForObject("select name from clinic where id = ?", String.class, clinicId);
    }
}
