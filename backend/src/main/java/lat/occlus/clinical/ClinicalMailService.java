package lat.occlus.clinical;
import java.util.UUID;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.mail.javamail.*;
import org.springframework.stereotype.Service;
@Service
public class ClinicalMailService {
    private final ClinicalAccess access;
    private final ClinicalDocumentService documents;
    private final ClinicalDocumentAudit audit;
    private final JavaMailSenderImpl sender = new JavaMailSenderImpl();
    private final boolean enabled;
    private final String from;
    public ClinicalMailService(ClinicalAccess access,ClinicalDocumentService documents,ClinicalDocumentAudit audit,
        @Value("${occlus.clinical-mail.enabled:false}") boolean enabled,
        @Value("${occlus.clinical-mail.host:}") String host,
        @Value("${occlus.clinical-mail.port:587}") int port,
        @Value("${occlus.clinical-mail.username:}") String username,
        @Value("${occlus.clinical-mail.password:}") String password,
        @Value("${occlus.clinical-mail.from:}") String from,
        @Value("${occlus.clinical-mail.ssl:false}") boolean ssl) {
        this.access=access; this.documents=documents; this.audit=audit; this.from=from;
        this.enabled=enabled && !host.isBlank() && from.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+") && !username.isBlank() && !password.isBlank();
        sender.setHost(host); sender.setPort(port); sender.setUsername(username); sender.setPassword(password);
        var p=sender.getJavaMailProperties(); p.setProperty("mail.smtp.auth","true");
        p.setProperty("mail.smtp.ssl.enable",String.valueOf(ssl));
        p.setProperty("mail.smtp.starttls.enable",String.valueOf(!ssl)); p.setProperty("mail.smtp.starttls.required",String.valueOf(!ssl));
        p.setProperty("mail.smtp.ssl.checkserveridentity","true");
        p.setProperty("mail.smtp.connectiontimeout","10000"); p.setProperty("mail.smtp.timeout","15000"); p.setProperty("mail.smtp.writetimeout","15000");
    }
    public boolean available() { return enabled; }
    public void send(AuthUser actor,UUID patientId,UUID operation,boolean confirmed) {
        if(!enabled) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,"El correo está pendiente de configuración. Puedes descargar el PDF.");
        if(!confirmed) throw new BadRequestException("Confirma que el paciente autorizó el envío al correo registrado");
        var patient=access.requirePatient(actor.clinicId(),patientId);
        String recipient=patient.getEmail();
        if(recipient==null || !recipient.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")) throw new BadRequestException("Registra un correo válido en la ficha del paciente");
        var pdf=documents.pdf(documents.document(actor,patientId,null));
        audit.record(actor,patientId,operation,"EMAIL","ATTEMPTED");
        try {
            var message=sender.createMimeMessage(); var helper=new MimeMessageHelper(message,true,"UTF-8");
            helper.setFrom(from); helper.setTo(recipient); helper.setSubject("Copia de historia clínica");
            helper.setText("Adjuntamos la copia solicitada. Este documento contiene información confidencial y está dirigido exclusivamente a su destinatario.");
            helper.addAttachment("historia-clinica.pdf",new ByteArrayResource(pdf),"application/pdf");
            sender.send(message);
        } catch(Exception e) {
            audit.record(actor,patientId,operation,"EMAIL","UNCERTAIN");
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_GATEWAY,"No pudimos confirmar el envío. Revisa el proveedor antes de intentarlo nuevamente.");
        }
        audit.record(actor,patientId,operation,"EMAIL","ACCEPTED");
    }
}
