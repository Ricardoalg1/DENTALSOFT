package lat.occlus.booking;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import lat.occlus.appointment.AgendaDtos.StatusRequest;
import lat.occlus.appointment.AppointmentService;
import lat.occlus.appointment.AppointmentStatus;
import lat.occlus.appointment.VisitType;
import lat.occlus.auth.OpaqueTokens;
import lat.occlus.booking.BookingDtos.BookingInfo;
import lat.occlus.booking.BookingDtos.DetailsRequest;
import lat.occlus.booking.BookingDtos.HoldRequest;
import lat.occlus.booking.BookingDtos.HoldResponse;
import lat.occlus.booking.BookingDtos.ManageView;
import lat.occlus.booking.BookingDtos.Ref;
import lat.occlus.booking.BookingDtos.Slot;
import lat.occlus.booking.BookingDtos.VerifyResponse;
import lat.occlus.booking.BookingDtos.VisitOption;
import lat.occlus.messaging.PatientWhatsApp;
import lat.occlus.platform.Entitlements;
import lat.occlus.shared.tenant.TenantContext;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.ConflictException;
import lat.occlus.shared.web.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

/**
 * El lado público de la reserva: apartar una hora, verificar el contacto y gestionar la solicitud con un enlace.
 *
 * <p>La clínica sale siempre del slug o del token, y todo corre con ese contexto (RLS): el modo sistema solo se
 * usa para encontrar la clínica y para contar envíos por destinatario. Aquí nunca se lee un paciente: nadie puede
 * averiguar por esta vía quién es paciente de una clínica.
 */
@Service
@RequiredArgsConstructor
public class PublicBookingService {

    static final Duration HOLD_TTL = Duration.ofMinutes(10);
    static final String CONSENT_VERSION = "reserva-2026-11";
    private static final int MAX_CODE_ATTEMPTS = 5;
    private static final int MAX_SENDS_PER_HOLD = 3;
    private static final int MAX_SENDS_PER_TARGET_DAY = 6;
    private static final int MAX_PENDING_PER_CONTACT = 3;
    private static final int MAX_HOLDS_PER_CLINIC = 30;
    private static final int MAX_PENDING_PER_CLINIC = 200;
    private static final Duration RESEND_WAIT = Duration.ofSeconds(30);
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String UNAVAILABLE = "Esta página de reservas no está disponible.";
    private static final String TAKEN = "Esa hora acaba de ocuparse. Elige otra.";
    private static final String BAD_LINK = "Este enlace no es válido o ya venció.";
    private static final String HOLD_GONE = "El tiempo para reservar esta hora terminó. Elige una hora de nuevo.";

    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    private final BookingSlots slots;
    private final BookingNotifier notifier;
    private final BookingProperties props;
    private final CaptchaVerifier captcha;
    private final BookingRateLimit rateLimit;
    private final Entitlements entitlements;
    private final PatientWhatsApp whatsapp;
    private final AppointmentService appointments;

    // ---------- Consulta ----------

    public BookingInfo info(String slug) {
        var s = settings(slug);
        return TenantContext.callAs(s.clinicId(), () -> {
            var channels = new ArrayList<String>();
            if (notifier.available(BookingNotifier.EMAIL)) channels.add(BookingNotifier.EMAIL);
            if (notifier.available(BookingNotifier.WHATSAPP)) channels.add(BookingNotifier.WHATSAPP);
            String clinic = clinicName(s.clinicId());
            return new BookingInfo(clinic, dentists(s), s.visitTypes().stream().map(t -> new VisitOption(t, t.label())).toList(),
                    s.durationMinutes(), channels, CONSENT_VERSION, consentText(clinic),
                    props.captchaConfigured() ? props.turnstileSiteKey() : null);
        });
    }

    public List<Slot> slots(String slug, UUID dentistId, LocalDate from) {
        var s = settings(slug);
        if (!s.dentistIds().contains(dentistId)) throw new NotFoundException(UNAVAILABLE);
        return TenantContext.callAs(s.clinicId(), () -> tx.execute(t -> {
            if (dentists(s).stream().noneMatch(d -> d.id().equals(dentistId))) throw new NotFoundException(UNAVAILABLE);
            return slots.free(s.clinicId(), s, dentistId, from);
        }));
    }

    // ---------- Apartar ----------

    public HoldResponse hold(String slug, HoldRequest req, String clientIp) {
        var s = settings(slug);
        rateLimit.checkHold(clientIp);
        if (props.captchaConfigured() && !captcha.verify(req.captchaToken(), clientIp)) {
            throw new BadRequestException("No pudimos comprobar que eres una persona. Recarga la página e inténtalo de nuevo.");
        }
        if (!s.visitTypes().contains(req.visitType()) || !s.dentistIds().contains(req.dentistId())) throw new BadRequestException("Esa opción no está disponible.");
        String token = OpaqueTokens.newToken();
        Instant expiresAt = Instant.now().plus(HOLD_TTL);
        try {
            TenantContext.callAs(s.clinicId(), () -> tx.execute(t -> {
                expireStaleHolds(s.clinicId());
                if (count(s.clinicId(), "HOLD") >= MAX_HOLDS_PER_CLINIC || count(s.clinicId(), "PENDING") >= MAX_PENDING_PER_CLINIC) {
                    throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Esta clínica tiene muchas solicitudes en este momento. Inténtalo más tarde o llama a la clínica.");
                }
                requireFree(s, req.dentistId(), req.siteId(), req.startsAt());
                var start = req.startsAt().toInstant();
                db.update("""
                        insert into online_booking_request (clinic_id, dentist_id, site_id, starts_at, ends_at, visit_type, hold_token_hash, hold_expires_at)
                        values (?, ?, ?, ?, ?, ?, ?, ?)""", s.clinicId(), req.dentistId(), req.siteId(), Timestamp.from(start),
                        Timestamp.from(start.plusSeconds(s.durationMinutes() * 60L)), req.visitType().name(),
                        OpaqueTokens.hash(token), Timestamp.from(expiresAt));
                return null;
            }));
        } catch (DataIntegrityViolationException e) {
            throw new ConflictException(TAKEN);
        }
        return new HoldResponse(token, expiresAt);
    }

    // ---------- Datos de contacto y código ----------

    public void details(String slug, DetailsRequest req) {
        var s = settings(slug);
        if (!Boolean.TRUE.equals(req.consentAccepted()) || !CONSENT_VERSION.equals(req.consentVersion())) {
            throw new BadRequestException("Debes aceptar el tratamiento de tus datos para continuar.");
        }
        if (!notifier.available(req.channel())) throw new BadRequestException("Ese medio de envío no está disponible.");
        String email = req.email().strip().toLowerCase(Locale.ROOT);
        String target = BookingNotifier.WHATSAPP.equals(req.channel())
                ? whatsapp.normalize(req.phone()).orElseThrow(() -> new BadRequestException("Escribe un celular colombiano de 10 dígitos para recibir el código por WhatsApp."))
                : email;
        String phoneDigits = req.phone().replaceAll("\\D", "");
        // Entre clínicas: nadie puede usar Occlus para llenar de mensajes a un tercero.
        Integer sentToday = TenantContext.callAsSystem(() -> db.queryForObject(
                "select coalesce(sum(code_sends), 0) from online_booking_request where verify_target = ? and created_at > now() - interval '24 hours'",
                Integer.class, target));
        if (sentToday != null && sentToday >= MAX_SENDS_PER_TARGET_DAY) throw tooMany();

        String code = "%06d".formatted(RANDOM.nextInt(1_000_000));
        String clinic = TenantContext.callAs(s.clinicId(), () -> tx.execute(t -> {
            var hold = db.query("""
                    select id, code_sends, code_sent_at from online_booking_request
                    where hold_token_hash = ? and clinic_id = ? and status = 'HOLD' and hold_expires_at > now() for update""",
                    (rs, i) -> new Object[] {rs.getObject(1, UUID.class), rs.getInt(2), rs.getTimestamp(3)},
                    OpaqueTokens.hash(req.holdToken()), s.clinicId());
            if (hold.isEmpty()) throw new ConflictException(HOLD_GONE);
            UUID id = (UUID) hold.getFirst()[0];
            var lastSent = (Timestamp) hold.getFirst()[2];
            if ((int) hold.getFirst()[1] >= MAX_SENDS_PER_HOLD) throw tooMany();
            if (lastSent != null && lastSent.toInstant().plus(RESEND_WAIT).isAfter(Instant.now())) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Espera unos segundos antes de pedir otro código.");
            }
            Integer pending = db.queryForObject("""
                    select count(*) from online_booking_request where clinic_id = ? and status = 'PENDING' and (lower(email) = ? or regexp_replace(phone, '\\D', '', 'g') = ?)""",
                    Integer.class, s.clinicId(), email, phoneDigits);
            if (pending != null && pending >= MAX_PENDING_PER_CONTACT) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Ya tienes varias solicitudes pendientes en esta clínica. Espera a que te respondan.");
            }
            db.update("""
                    update online_booking_request set full_name = ?, phone = ?, email = ?, channel = ?, verify_target = ?, code_hash = ?,
                        code_attempts = 0, code_sends = code_sends + 1, code_sent_at = now(), consent_version = ?, consent_at = now() where id = ?""",
                    req.fullName().strip(), req.phone().strip(), email, req.channel(), target, codeHash(id, code), CONSENT_VERSION, id);
            return clinicName(s.clinicId());
        }));
        // Fuera de la transacción: un proveedor lento no debe retener la fila.
        if (!notifier.sendCode(req.channel(), target, clinic, code)) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "No pudimos enviar el código. Revisa el dato o prueba de nuevo en un momento.");
        }
    }

    private record VerifyOutcome(boolean ok, boolean exhausted, String manageToken, String channel, String target, String clinic) {}

    public VerifyResponse verify(String slug, String holdToken, String code) {
        var s = settings(slug);
        // Un código incorrecto debe quedar contado: por eso el error se lanza después de confirmar la transacción.
        var outcome = TenantContext.callAs(s.clinicId(), () -> tx.execute(t -> {
            var rows = db.query("""
                    select id, code_hash, code_attempts, channel, verify_target from online_booking_request
                    where hold_token_hash = ? and clinic_id = ? and status = 'HOLD' and hold_expires_at > now() for update""",
                    (rs, i) -> new Object[] {rs.getObject(1, UUID.class), rs.getString(2), rs.getInt(3), rs.getString(4), rs.getString(5)},
                    OpaqueTokens.hash(holdToken), s.clinicId());
            if (rows.isEmpty()) return null;
            UUID id = (UUID) rows.getFirst()[0];
            String expected = (String) rows.getFirst()[1];
            if (expected == null) return new VerifyOutcome(false, false, null, null, null, null);
            boolean match = MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), codeHash(id, code.strip()).getBytes(StandardCharsets.UTF_8));
            if (!match) {
                int attempts = (int) rows.getFirst()[2] + 1;
                boolean exhausted = attempts >= MAX_CODE_ATTEMPTS;
                db.update("update online_booking_request set code_attempts = ?, status = ?, hold_token_hash = case when ? then null else hold_token_hash end where id = ?",
                        attempts, exhausted ? "EXPIRED" : "HOLD", exhausted, id);
                return new VerifyOutcome(false, exhausted, null, null, null, null);
            }
            String manage = OpaqueTokens.newToken();
            db.update("""
                    update online_booking_request set status = 'PENDING', verified_at = now(), hold_token_hash = null, code_hash = null,
                        manage_token_hash = ? where id = ?""", OpaqueTokens.hash(manage), id);
            return new VerifyOutcome(true, false, manage, (String) rows.getFirst()[3], (String) rows.getFirst()[4], clinicName(s.clinicId()));
        }));
        if (outcome == null) throw new ConflictException(HOLD_GONE);
        if (outcome.exhausted()) throw new ConflictException("Demasiados códigos incorrectos. Elige una hora de nuevo.");
        if (!outcome.ok()) throw new BadRequestException("El código no es correcto.");
        notifier.notice(outcome.channel(), outcome.target(), "Recibimos tu solicitud de cita en " + outcome.clinic(),
                "La clínica " + outcome.clinic() + " revisará tu solicitud y te avisará. Para cancelarla o cambiarla usa este enlace: " + manageLink(outcome.manageToken()));
        return new VerifyResponse(outcome.manageToken());
    }

    // ---------- Gestionar con el enlace ----------

    private record Managed(UUID id, UUID clinicId, UUID dentistId, UUID siteId, Instant startsAt, String status, String visitType,
                           UUID appointmentId, String channel, String target) {}

    public ManageView inspect(String token) {
        var m = managed(token);
        return TenantContext.callAs(m.clinicId(), () -> tx.execute(t -> {
            String dentist = db.queryForObject("select full_name from app_user where id = ?", String.class, m.dentistId());
            String site = db.queryForObject("select name from site where id = ?", String.class, m.siteId());
            return new ManageView(clinicName(m.clinicId()), m.status(), m.startsAt().atZone(BookingSlots.BOGOTA).toOffsetDateTime(),
                    dentist, site, VisitType.valueOf(m.visitType()).label());
        }));
    }

    public List<Slot> manageSlots(String token, LocalDate from) {
        var m = managed(token);
        var s = activeSettings(m.clinicId());
        return TenantContext.callAs(m.clinicId(), () -> tx.execute(t -> slots.free(m.clinicId(), s, m.dentistId(), from)));
    }

    public void cancel(String token) {
        var m = managed(token);
        TenantContext.callAs(m.clinicId(), () -> tx.execute(t -> {
            releaseAppointment(m, "Cancelada por el paciente desde su enlace");
            db.update("update online_booking_request set status = 'CANCELLED', manage_token_hash = null, appointment_id = null where id = ?", m.id());
            return null;
        }));
        notifier.notice(m.channel(), m.target(), "Tu cita fue cancelada", "Cancelamos tu solicitud de cita. Si necesitas otra hora, reserva de nuevo o llama a la clínica.");
    }

    /** Cambiar la hora vuelve a pasar por recepción, también si la cita ya estaba confirmada. */
    public void reschedule(String token, UUID siteId, OffsetDateTime startsAt) {
        var m = managed(token);
        var s = activeSettings(m.clinicId());
        try {
            TenantContext.callAs(m.clinicId(), () -> tx.execute(t -> {
                expireStaleHolds(m.clinicId());
                requireFree(s, m.dentistId(), siteId, startsAt);
                releaseAppointment(m, "Reprogramada por el paciente desde su enlace");
                var start = startsAt.toInstant();
                db.update("""
                        update online_booking_request set site_id = ?, starts_at = ?, ends_at = ?, status = 'PENDING',
                            appointment_id = null, decided_by = null, decided_at = null where id = ?""",
                        siteId, Timestamp.from(start), Timestamp.from(start.plusSeconds(s.durationMinutes() * 60L)), m.id());
                return null;
            }));
        } catch (DataIntegrityViolationException e) {
            throw new ConflictException(TAKEN);
        }
        notifier.notice(m.channel(), m.target(), "Recibimos tu cambio de cita", "La clínica revisará la nueva hora y te avisará.");
    }

    private void releaseAppointment(Managed m, String reason) {
        if (m.appointmentId() != null) {
            appointments.changeStatus(m.clinicId(), m.appointmentId(), new StatusRequest(AppointmentStatus.CANCELLED, reason));
        }
    }

    /** Solo vale para esta solicitud, mientras siga activa y la cita no haya pasado. */
    private Managed managed(String token) {
        String hash = OpaqueTokens.hash(token);
        var clinic = TenantContext.callAsSystem(() -> db.query(
                "select clinic_id from online_booking_request where manage_token_hash = ?", (rs, i) -> rs.getObject(1, UUID.class), hash));
        if (clinic.isEmpty()) throw new BadRequestException(BAD_LINK);
        var rows = TenantContext.callAs(clinic.getFirst(), () -> db.query("""
                select r.id, r.clinic_id, r.dentist_id, r.site_id, r.starts_at, r.status, r.visit_type, r.appointment_id, r.channel, r.verify_target
                from online_booking_request r left join appointment a on a.id = r.appointment_id
                where r.manage_token_hash = ? and r.starts_at > now() and r.status in ('PENDING', 'CONFIRMED')
                  and (r.appointment_id is null or a.status in ('SCHEDULED', 'CONFIRMED'))""",
                (rs, i) -> new Managed(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getObject(3, UUID.class), rs.getObject(4, UUID.class),
                        rs.getTimestamp(5).toInstant(), rs.getString(6), rs.getString(7), rs.getObject(8, UUID.class), rs.getString(9), rs.getString(10)), hash));
        if (rows.isEmpty()) throw new BadRequestException(BAD_LINK);
        return rows.getFirst();
    }

    String manageLink(String token) {
        // En el fragmento (#): el navegador no lo envía a ningún servidor ni aparece en registros.
        return props.baseUrl() + "/mi-cita#t=" + token;
    }

    // ---------- Apoyo ----------

    private BookingSettings settings(String slug) {
        if (slug == null || !slug.matches("[a-z0-9-]{3,60}")) throw new NotFoundException(UNAVAILABLE);
        // Sin la llave del captcha la página se apaga: nunca queda abierta sin protección.
        if (props.captchaRequired() && !props.captchaConfigured()) throw new NotFoundException(UNAVAILABLE);
        var rows = TenantContext.callAsSystem(() -> db.query(
                "select " + BookingSettings.COLUMNS + " from online_booking_settings where slug = ? and enabled", BookingSettings::map, slug));
        if (rows.isEmpty()) throw new NotFoundException(UNAVAILABLE);
        requireActive(rows.getFirst().clinicId());
        return rows.getFirst();
    }

    private BookingSettings activeSettings(UUID clinicId) {
        var rows = TenantContext.callAs(clinicId, () -> db.query(
                "select " + BookingSettings.COLUMNS + " from online_booking_settings where clinic_id = ? and enabled", BookingSettings::map, clinicId));
        if (rows.isEmpty()) throw new NotFoundException(UNAVAILABLE);
        requireActive(clinicId);
        return rows.getFirst();
    }

    /** Con la suscripción vencida la página se apaga, igual que si no existiera. */
    private void requireActive(UUID clinicId) {
        if (!TenantContext.callAs(clinicId, () -> entitlements.allows(clinicId, null))) throw new NotFoundException(UNAVAILABLE);
    }

    private void requireFree(BookingSettings s, UUID dentistId, UUID siteId, OffsetDateTime startsAt) {
        var day = startsAt.atZoneSameInstant(BookingSlots.BOGOTA).toLocalDate();
        boolean free = slots.free(s.clinicId(), s, dentistId, day).stream()
                .anyMatch(x -> x.siteId().equals(siteId) && x.startsAt().toInstant().equals(startsAt.toInstant()));
        if (!free) throw new ConflictException(TAKEN);
    }

    private void expireStaleHolds(UUID clinicId) {
        db.update("update online_booking_request set status = 'EXPIRED', hold_token_hash = null where clinic_id = ? and status = 'HOLD' and hold_expires_at <= now()", clinicId);
    }

    private int count(UUID clinicId, String status) {
        Integer n = db.queryForObject("select count(*) from online_booking_request where clinic_id = ? and status = ?", Integer.class, clinicId, status);
        return n == null ? 0 : n;
    }

    private List<Ref> dentists(BookingSettings s) {
        if (s.dentistIds().isEmpty()) return List.of();
        var ids = String.join(",", s.dentistIds().stream().map(UUID::toString).toList());
        return db.query("""
                select id, full_name from app_user where clinic_id = ? and active and professional
                and id = any(string_to_array(?, ',')::uuid[]) order by full_name""",
                (rs, i) -> new Ref(rs.getObject(1, UUID.class), rs.getString(2)), s.clinicId(), ids);
    }

    private String clinicName(UUID clinicId) {
        return db.queryForObject("select name from clinic where id = ?", String.class, clinicId);
    }

    private static String codeHash(UUID requestId, String code) {
        return OpaqueTokens.hash(requestId + ":" + code);
    }

    private static ResponseStatusException tooMany() {
        return new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Se enviaron demasiados códigos a ese dato. Inténtalo mañana o llama a la clínica.");
    }

    private static String consentText(String clinic) {
        return "Autorizo a " + clinic + ", responsable del tratamiento, a usar mi nombre, teléfono y correo para gestionar esta solicitud de cita y contactarme sobre ella, "
                + "conforme a la Ley 1581 de 2012. Occlus los procesa como encargado. Puedo conocer, actualizar o suprimir mis datos escribiendo a la clínica. "
                + "Si la solicitud no se confirma, se borra a los 30 días.";
    }

    // ---------- Limpieza ----------

    /** Sin confirmar no se guarda nada más de lo necesario: lo vencido cae en 2 días y lo demás a los 30. */
    @Scheduled(cron = "0 50 3 * * *", zone = "America/Bogota")
    void cleanup() {
        TenantContext.callAsSystem(() -> {
            db.update("update online_booking_request set status = 'EXPIRED', hold_token_hash = null where status = 'HOLD' and hold_expires_at <= now()");
            db.update("update online_booking_request set status = 'EXPIRED', manage_token_hash = null where status = 'PENDING' and starts_at <= now()");
            db.update("delete from online_booking_request where status = 'EXPIRED' and created_at < now() - interval '2 days' and verified_at is null");
            return db.update("delete from online_booking_request where status <> 'HOLD' and status <> 'PENDING' and greatest(starts_at, created_at) < now() - interval '30 days'");
        });
    }
}
