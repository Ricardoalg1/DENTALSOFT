package lat.occlus.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

/** Usa el mismo proveedor SMTP de los correos clínicos; solo cambia, si se quiere, el remitente. */
@Component
@ConditionalOnProperty(name = "occlus.account-security.mail-provider", havingValue = "smtp", matchIfMissing = true)
class SmtpMailTransport implements MailTransport {

    private final JavaMailSenderImpl sender = new JavaMailSenderImpl();
    private final boolean configured;
    private final String from;

    SmtpMailTransport(
            @Value("${occlus.clinical-mail.enabled:false}") boolean enabled,
            @Value("${occlus.clinical-mail.host:}") String host,
            @Value("${occlus.clinical-mail.port:587}") int port,
            @Value("${occlus.clinical-mail.username:}") String username,
            @Value("${occlus.clinical-mail.password:}") String password,
            @Value("${occlus.account-security.mail-from:}") String accountFrom,
            @Value("${occlus.clinical-mail.from:}") String clinicalFrom,
            @Value("${occlus.clinical-mail.ssl:false}") boolean ssl) {
        this.from = accountFrom.isBlank() ? clinicalFrom : accountFrom;
        this.configured = enabled && !host.isBlank() && from.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+") && !username.isBlank() && !password.isBlank();
        sender.setHost(host);
        sender.setPort(port);
        sender.setUsername(username);
        sender.setPassword(password);
        var p = sender.getJavaMailProperties();
        p.setProperty("mail.smtp.auth", "true");
        p.setProperty("mail.smtp.ssl.enable", String.valueOf(ssl));
        p.setProperty("mail.smtp.starttls.enable", String.valueOf(!ssl));
        p.setProperty("mail.smtp.starttls.required", String.valueOf(!ssl));
        p.setProperty("mail.smtp.ssl.checkserveridentity", "true");
        p.setProperty("mail.smtp.connectiontimeout", "10000");
        p.setProperty("mail.smtp.timeout", "15000");
        p.setProperty("mail.smtp.writetimeout", "15000");
    }

    @Override
    public boolean configured() {
        return configured;
    }

    @Override
    public void send(String to, String subject, String text) throws Exception {
        var message = sender.createMimeMessage();
        var helper = new MimeMessageHelper(message, false, "UTF-8");
        helper.setFrom(from);
        helper.setTo(to);
        helper.setSubject(subject);
        helper.setText(text);
        sender.send(message);
    }

    @Override
    public void send(String to, String subject, String text, String html) throws Exception {
        var message = sender.createMimeMessage();
        var helper = new MimeMessageHelper(message, true, "UTF-8");
        helper.setFrom(from);
        helper.setTo(to);
        helper.setSubject(subject);
        helper.setText(text, html);
        sender.send(message);
    }
}
