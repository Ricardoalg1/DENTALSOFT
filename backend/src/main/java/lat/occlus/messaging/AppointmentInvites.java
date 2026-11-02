package lat.occlus.messaging;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import lat.occlus.appointment.AppointmentRepository;
import lat.occlus.appointment.VisitType;
import lat.occlus.clinic.ClinicRepository;
import lat.occlus.patient.PatientRepository;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.NotFoundException;
import lat.occlus.site.SiteRepository;
import lat.occlus.user.AppUserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Invitación a la cita por WhatsApp sin API de Meta: se arma el mensaje con la plantilla del tipo de cita y un
 * enlace wa.me, y la recepción lo envía desde su WhatsApp Web. Cada clínica puede editar el texto de cada tipo.
 */
@Service
@RequiredArgsConstructor
public class AppointmentInvites {

    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("hh:mm a", Locale.US);
    private static final Pattern PLACEHOLDER = Pattern.compile("\\{([a-z]+)}");
    private static final int MAX_LENGTH = 2000;

    /** Datos que se pueden usar en el mensaje, en el orden en que se le muestran a la clínica. */
    public static final Map<String, String> PLACEHOLDERS = placeholders(
            "nombre", "Primer nombre del paciente",
            "paciente", "Nombre completo del paciente",
            "fecha", "Fecha de la cita (30/10/2026)",
            "hora", "Hora de la cita (08:00 AM)",
            "profesional", "Profesional que atiende",
            "motivo", "Tipo de cita (Control, Primera vez…)",
            "consultorio", "Nombre de la clínica",
            "sede", "Nombre de la sede",
            "direccion", "Dirección de la sede",
            "ciudad", "Ciudad de la sede",
            "telefono", "Teléfono de la sede");

    private static final String CONTACT = """


            Información de contacto:
            {sede}
            Teléfono {telefono}
            Dirección {direccion} {ciudad}

            Le agradecemos que nos confirme su asistencia. Lo esperamos. ¡Que tenga un excelente día!""";

    private static final Map<VisitType, String> DEFAULTS = new EnumMap<>(Map.of(
            VisitType.FIRST_VISIT, """
                    Señor(a) {nombre},
                    ¡bienvenido(a) a {consultorio}! Su primera cita en {sede} es el {fecha} a las {hora} con el(la) \
                    Dr(a). {profesional}. Le pedimos llegar 15 minutos antes y traer su documento de identidad.""" + CONTACT,
            VisitType.CONTROL, """
                    Señor(a) {nombre},
                    le recordamos que su próxima cita de control en {sede} es el {fecha} a las {hora} con el(la) \
                    Dr(a). {profesional}.""" + CONTACT,
            VisitType.TREATMENT, """
                    Señor(a) {nombre},
                    le recordamos que su próxima cita para continuar su tratamiento en {sede} es el {fecha} a las \
                    {hora} con el(la) Dr(a). {profesional}.""" + CONTACT,
            VisitType.PREVENTION, """
                    Señor(a) {nombre},
                    le recordamos que su cita de promoción y prevención (P&P) en {sede} es el {fecha} a las {hora} \
                    con el(la) Dr(a). {profesional}. Cuidar su salud oral a tiempo evita tratamientos mayores.""" + CONTACT));

    private final JdbcTemplate db;
    private final AppointmentRepository appointments;
    private final PatientRepository patients;
    private final AppUserRepository users;
    private final SiteRepository sites;
    private final ClinicRepository clinics;

    public record TemplateView(VisitType visitType, String label, String body, String defaultBody, boolean custom) {}

    public record TemplateRequest(@NotBlank @Size(max = MAX_LENGTH) String body) {}

    /** {@code url} es nulo si el paciente no tiene un celular colombiano válido; el mensaje se puede copiar igual. */
    public record Invite(String phone, String message, String url) {}

    @Transactional(readOnly = true)
    public List<TemplateView> templates(UUID clinicId) {
        var custom = customBodies(clinicId);
        return Arrays.stream(VisitType.values()).map(t -> view(t, custom.get(t))).toList();
    }

    @Transactional
    public TemplateView save(AuthUser me, VisitType type, String body) {
        String text = body.strip().replace("\r\n", "\n");
        if (text.isEmpty()) throw new BadRequestException("Escribe el mensaje");
        if (text.length() > MAX_LENGTH) throw new BadRequestException("El mensaje admite máximo 2.000 caracteres");
        var unknown = PLACEHOLDER.matcher(text).results().map(m -> m.group(1))
                .filter(name -> !PLACEHOLDERS.containsKey(name)).distinct().toList();
        if (!unknown.isEmpty()) {
            throw new BadRequestException("Dato no reconocido en el mensaje: " + unknown.stream()
                    .map(n -> "{" + n + "}").collect(Collectors.joining(", ")));
        }
        db.update("""
                insert into appointment_message_template (clinic_id, visit_type, body, updated_by) values (?, ?, ?, ?)
                on conflict (clinic_id, visit_type) do update
                set body = excluded.body, updated_by = excluded.updated_by, updated_at = now()
                """, me.clinicId(), type.name(), text, me.userId());
        return view(type, text);
    }

    /** Vuelve al mensaje predeterminado. */
    @Transactional
    public TemplateView reset(UUID clinicId, VisitType type) {
        db.update("delete from appointment_message_template where clinic_id = ? and visit_type = ?", clinicId, type.name());
        return view(type, null);
    }

    @Transactional(readOnly = true)
    public Invite invite(UUID clinicId, UUID appointmentId) {
        var a = appointments.findByIdAndClinicId(appointmentId, clinicId)
                .orElseThrow(() -> new NotFoundException("Cita no encontrada"));
        var patient = patients.findByIdAndClinicId(a.getPatientId(), clinicId).orElseThrow();
        var dentist = users.findByIdAndClinicId(a.getDentistId(), clinicId).orElseThrow();
        var site = sites.findById(a.getSiteId()).orElseThrow();
        var clinic = clinics.findById(clinicId).orElseThrow();
        // Las citas anteriores a los tipos no tienen uno: se invitan como control.
        var type = a.getVisitType() == null ? VisitType.CONTROL : a.getVisitType();
        var startsAt = a.getStartsAt().atZone(BOGOTA);

        var values = new LinkedHashMap<String, String>();
        values.put("nombre", patient.getFirstName());
        values.put("paciente", patient.fullName());
        values.put("fecha", DATE.format(startsAt));
        values.put("hora", TIME.format(startsAt));
        values.put("profesional", dentist.getFullName());
        values.put("motivo", type.label());
        values.put("consultorio", clinic.getName());
        values.put("sede", site.getName());
        values.put("direccion", site.getAddress());
        values.put("ciudad", site.getCity());
        values.put("telefono", site.getPhone());

        String message = render(customBodies(clinicId).getOrDefault(type, DEFAULTS.get(type)), values);
        var phone = Phones.toWhatsApp(patient.getPhone()).orElse(null);
        String url = phone == null ? null
                : "https://wa.me/" + phone + "?text=" + URLEncoder.encode(message, StandardCharsets.UTF_8).replace("+", "%20");
        return new Invite(phone, message, url);
    }

    /**
     * Reemplaza los datos. Una línea cuyos datos están todos vacíos se quita (p. ej. «Teléfono {telefono}» en una
     * sede sin teléfono), para que el mensaje no quede con renglones a medias.
     */
    static String render(String template, Map<String, String> values) {
        var lines = template.split("\n", -1);
        var out = new StringBuilder();
        for (String line : lines) {
            Matcher m = PLACEHOLDER.matcher(line);
            boolean any = false, filled = false;
            var sb = new StringBuilder();
            while (m.find()) {
                if (!PLACEHOLDERS.containsKey(m.group(1))) continue;
                any = true;
                String v = values.get(m.group(1));
                v = v == null ? "" : v.strip();
                if (!v.isEmpty()) filled = true;
                m.appendReplacement(sb, Matcher.quoteReplacement(v));
            }
            m.appendTail(sb);
            if (any && !filled) continue;
            out.append(sb.toString().replaceAll("[ \\t]{2,}", " ").stripTrailing()).append('\n');
        }
        return out.toString().strip();
    }

    private Map<VisitType, String> customBodies(UUID clinicId) {
        var map = new EnumMap<VisitType, String>(VisitType.class);
        db.query("select visit_type, body from appointment_message_template where clinic_id = ?",
                rs -> { map.put(VisitType.valueOf(rs.getString("visit_type")), rs.getString("body")); }, clinicId);
        return map;
    }

    private static TemplateView view(VisitType type, String custom) {
        return new TemplateView(type, type.label(), custom == null ? DEFAULTS.get(type) : custom, DEFAULTS.get(type),
                custom != null);
    }

    private static Map<String, String> placeholders(String... pairs) {
        var map = new LinkedHashMap<String, String>();
        for (int i = 0; i < pairs.length; i += 2) map.put(pairs[i], pairs[i + 1]);
        return java.util.Collections.unmodifiableMap(map);
    }
}
