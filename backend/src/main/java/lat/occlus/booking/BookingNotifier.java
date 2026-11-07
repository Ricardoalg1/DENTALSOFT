package lat.occlus.booking;

import lat.occlus.auth.Email;
import lat.occlus.auth.MailTransport;
import lat.occlus.messaging.PatientWhatsApp;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/** Escribe solo al canal que la persona verificó. Los registros nunca incluyen el destinatario ni el contenido. */
@Component
@RequiredArgsConstructor
@Slf4j
class BookingNotifier {

    static final String EMAIL = "EMAIL";
    static final String WHATSAPP = "WHATSAPP";

    private final MailTransport mail;
    private final PatientWhatsApp whatsapp;
    private final BookingProperties props;

    boolean available(String channel) {
        return EMAIL.equals(channel) ? mail.configured() : whatsapp.available();
    }

    /** Devuelve false si el proveedor no aceptó el mensaje, para decírselo a quien espera el código. */
    boolean sendCode(String channel, String target, String clinicName, String code) {
        if (WHATSAPP.equals(channel)) return whatsapp.sendCode(target, code);
        return mailTo(target, "Tu código para reservar en " + clinicName, Email.titled("Confirma tu solicitud de cita")
                .eyebrow(clinicName)
                .line("Escribe este código en la página de reservas para enviar tu solicitud a la clínica.")
                .code(code, "Vence en 10 minutos.")
                .note("Si no pediste esta cita, ignora este mensaje: no quedará ninguna reserva."), clinicName);
    }

    /** Aviso informativo: si falla, no deshace lo que ya se decidió. */
    void notice(String channel, String target, String subject, Email email, String clinicName) {
        boolean sent = WHATSAPP.equals(channel) ? whatsapp.sendNotice(target, email.oneLine()) : mailTo(target, subject, email, clinicName);
        if (!sent) log.warn("No se pudo enviar un aviso de reserva por {}", channel);
    }

    private boolean mailTo(String to, String subject, Email email, String clinicName) {
        if (!mail.configured()) return false;
        try {
            email.footer("Enviado por Occlus en nombre de " + clinicName + ". Este correo es automático: para hablar con la clínica, llámala directamente.");
            mail.send(to, subject, email.text(), email.html(props.baseUrl() + "/logo-correo.png"));
            return true;
        } catch (Exception e) {
            log.warn("No se pudo enviar un correo de reserva: {}", e.getClass().getSimpleName());
            return false;
        }
    }
}
