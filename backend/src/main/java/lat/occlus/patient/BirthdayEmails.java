package lat.occlus.patient;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import lat.occlus.auth.Email;
import lat.occlus.auth.MailTransport;
import lat.occlus.auth.OpaqueTokens;
import lat.occlus.platform.Entitlements;
import lat.occlus.shared.tenant.TenantContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Saludo de cumpleaños por correo. Solo sale si la clínica lo activó, el paciente lo autorizó, está activo,
 * tiene correo y la suscripción de la clínica da acceso. Un saludo por paciente y año (lo garantiza la llave
 * de birthday_email). Los registros nunca incluyen el destinatario ni el nombre del paciente.
 */
@Component
@Slf4j
public class BirthdayEmails {

    static final ZoneId BOGOTA = ZoneId.of("America/Bogota");
    /** Tope por clínica y día: protege la reputación del remitente si algo sale mal con los datos. */
    private static final int MAX_PER_CLINIC = 500;

    private final JdbcTemplate db;
    private final MailTransport mail;
    private final Entitlements entitlements;
    private final String appUrl;
    private final PatientRepository patients;
    private final TransactionTemplate tx;

    BirthdayEmails(JdbcTemplate db, MailTransport mail, Entitlements entitlements, PatientRepository patients,
                   TransactionTemplate tx, @Value("${occlus.account-security.app-url:}") String appUrl) {
        this.db = db;
        this.patients = patients;
        this.tx = tx;
        this.mail = mail;
        this.entitlements = entitlements;
        this.appUrl = appUrl.endsWith("/") ? appUrl.substring(0, appUrl.length() - 1) : appUrl;
    }

    public boolean mailConfigured() {
        return mail.configured() && (appUrl.startsWith("https://") || appUrl.startsWith("http://localhost"));
    }

    /** 9 a. m. de Colombia: una hora razonable para un saludo. */
    @Scheduled(cron = "${occlus.birthday-emails.cron:0 0 9 * * *}", zone = "America/Bogota")
    void daily() {
        int sent = sendFor(LocalDate.now(BOGOTA));
        if (sent > 0) log.info("Saludos de cumpleaños enviados: {}", sent);
    }

    /** Envía los saludos del día indicado. Devuelve cuántos salieron. */
    public int sendFor(LocalDate today) {
        if (!mailConfigured()) return 0;
        List<UUID> clinics = TenantContext.callAsSystem(
                () -> db.queryForList("select id from clinic where birthday_emails_enabled", UUID.class));
        int sent = 0;
        for (UUID clinicId : clinics) {
            try {
                sent += TenantContext.callAs(clinicId, () -> sendForClinic(clinicId, today));
            } catch (RuntimeException e) {
                log.warn("Falló la tarea de cumpleaños de una clínica: {}", e.getClass().getSimpleName());
            }
        }
        return sent;
    }

    private record Recipient(UUID id, String firstName, String email) {}

    private int sendForClinic(UUID clinicId, LocalDate today) {
        boolean allowed = entitlements.find(clinicId)
                .map(s -> s.access(Instant.now(), entitlements.grace()).allowed()).orElse(false);
        if (!allowed) return 0;
        String clinicName = db.queryForObject("select name from clinic where id = ?", String.class, clinicId);
        // Quien nació un 29 de febrero recibe el saludo el 28 en los años que no son bisiestos.
        boolean leapFallback = today.getMonthValue() == 2 && today.getDayOfMonth() == 28 && !today.isLeapYear();
        List<Recipient> recipients = db.query("""
                select p.id, p.first_name, p.email from patient p
                where p.clinic_id = ? and p.active and p.birthday_email_consent and p.email is not null
                  and ((extract(month from p.birth_date) = ? and extract(day from p.birth_date) = ?)
                       or (? and extract(month from p.birth_date) = 2 and extract(day from p.birth_date) = 29))
                  and not exists (select 1 from birthday_email b where b.patient_id = p.id and b.year = ?)
                order by p.id limit ?""",
                (rs, i) -> new Recipient(rs.getObject("id", UUID.class), rs.getString("first_name"), rs.getString("email")),
                clinicId, today.getMonthValue(), today.getDayOfMonth(), leapFallback, today.getYear(), MAX_PER_CLINIC);
        int sent = 0;
        for (Recipient r : recipients) {
            String token = OpaqueTokens.newToken();
            // Primero se reserva el saludo del año: si la tarea corre dos veces, la segunda no lo repite.
            int claimed = db.update("""
                    insert into birthday_email (clinic_id, patient_id, year, optout_token_hash) values (?, ?, ?, ?)
                    on conflict do nothing""", clinicId, r.id(), today.getYear(), OpaqueTokens.hash(token));
            if (claimed == 0) continue;
            try {
                Email email = message(clinicName, r.firstName(), token);
                mail.send(r.email(), "¡Feliz cumpleaños de parte de " + clinicName + "!", email.text(), email.html(appUrl + "/logo-correo.png"));
                sent++;
            } catch (Exception e) {
                // Sin envío no queda reserva: se reintenta en la próxima corrida del mismo día.
                db.update("delete from birthday_email where patient_id = ? and year = ?", r.id(), today.getYear());
                log.warn("No se pudo enviar un saludo de cumpleaños: {}", e.getClass().getSimpleName());
            }
        }
        return sent;
    }

    Email message(String clinicName, String firstName, String token) {
        return Email.titled("¡Feliz cumpleaños, " + firstName.trim() + "!")
                .eyebrow(clinicName)
                .line("Hoy todo el equipo de " + clinicName + " quiere desearte un muy feliz cumpleaños.")
                .line("Que este nuevo año llegue con mucha salud, alegría y motivos para sonreír. Gracias por confiar en nosotros.")
                .note("Recibes este saludo porque autorizaste a " + clinicName + " a enviártelo.")
                .footer("Enviado por Occlus en nombre de " + clinicName + ". Este correo es automático: para hablar con la clínica, llámala directamente.")
                .unsubscribe("No quiero recibir más saludos de cumpleaños", appUrl + "/baja-cumpleanos#t=" + token);
    }

    /**
     * Retira la autorización desde el enlace del correo. Responde igual si el enlace no existe, para no
     * revelar nada. Devuelve el nombre de la clínica para confirmárselo a la persona.
     */
    public java.util.Optional<String> optOut(String token) {
        if (token == null || token.isBlank() || token.length() > 100) return java.util.Optional.empty();
        String hash = OpaqueTokens.hash(token);
        return TenantContext.callAsSystem(() -> db.query("""
                        select b.clinic_id, b.patient_id, c.name from birthday_email b join clinic c on c.id = b.clinic_id
                        where b.optout_token_hash = ?""",
                (rs, i) -> new Object[] {rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getString(3)}, hash)
                .stream().findFirst()).map(row -> {
                    UUID clinicId = (UUID) row[0];
                    UUID patientId = (UUID) row[1];
                    // Por JPA y no por SQL: así la baja queda en el historial del paciente (Envers).
                    TenantContext.callAs(clinicId, () -> tx.execute(status -> {
                        patients.findById(patientId).filter(p -> clinicId.equals(p.getClinicId()) && p.isBirthdayEmailConsent())
                                .ifPresent(p -> {
                                    p.setBirthdayEmailConsent(false);
                                    p.setBirthdayEmailConsentAt(null);
                                });
                        return null;
                    }));
                    return (String) row[2];
                });
    }
}
