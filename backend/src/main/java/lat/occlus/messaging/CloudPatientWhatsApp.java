package lat.occlus.messaging;

import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Exige una plantilla de autenticación y otra de aviso aprobadas por Meta; sin ellas el canal no se ofrece. */
@Component
class CloudPatientWhatsApp implements PatientWhatsApp {

    private final MessagingProperties config;
    private final String codeTemplate;
    private final String noticeTemplate;

    CloudPatientWhatsApp(MessagingProperties config,
                         @Value("${occlus.booking.whatsapp-code-template:}") String codeTemplate,
                         @Value("${occlus.booking.whatsapp-notice-template:}") String noticeTemplate) {
        this.config = config;
        this.codeTemplate = codeTemplate;
        this.noticeTemplate = noticeTemplate;
    }

    @Override
    public boolean available() {
        return config.whatsapp() != null && config.whatsapp().configured() && !codeTemplate.isBlank() && !noticeTemplate.isBlank();
    }

    @Override
    public Optional<String> normalize(String phone) {
        return Phones.toWhatsApp(phone);
    }

    @Override
    public boolean sendCode(String phone, String code) {
        return new WhatsAppCloudSender(config.whatsapp()).sendAuthCode(phone, codeTemplate, config.whatsapp().templateLanguage(), code).ok();
    }

    @Override
    public boolean sendNotice(String phone, String text) {
        return new WhatsAppCloudSender(config.whatsapp()).sendTemplate(phone, noticeTemplate, config.whatsapp().templateLanguage(), List.of(text)).ok();
    }
}
