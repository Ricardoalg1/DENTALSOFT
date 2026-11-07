package lat.occlus.auth;

import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sesv2.SesV2Client;

/** Amazon SES por API. Las credenciales salen del rol de la instancia: no hay contraseña SMTP que guardar. */
@Component
@ConditionalOnProperty(name = "occlus.account-security.mail-provider", havingValue = "ses")
class SesMailTransport implements MailTransport {

    private final SesV2Client client;
    private final String from;

    SesMailTransport(@Value("${occlus.account-security.ses-region}") String region,
                     @Value("${occlus.account-security.mail-from:}") String from) {
        this.from = from;
        this.client = SesV2Client.builder()
                .region(Region.of(region))
                .credentialsProvider(DefaultCredentialsProvider.builder().build())
                .build();
    }

    @Override
    public boolean configured() {
        return from.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+");
    }

    @Override
    public void send(String to, String subject, String text) {
        client.sendEmail(r -> r
                .fromEmailAddress(from)
                .destination(d -> d.toAddresses(to))
                .content(c -> c.simple(m -> m
                        .subject(s -> s.data(subject).charset("UTF-8"))
                        .body(b -> b.text(t -> t.data(text).charset("UTF-8"))))));
    }

    @PreDestroy
    void close() {
        client.close();
    }
}
