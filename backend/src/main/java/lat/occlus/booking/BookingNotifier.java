package lat.occlus.booking;

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

    boolean available(String channel) {
        return EMAIL.equals(channel) ? mail.configured() : whatsapp.available();
    }

    /** Devuelve false si el proveedor no aceptó el mensaje, para decírselo a quien espera el código. */
    boolean sendCode(String channel, String target, String clinicName, String code) {
        if (WHATSAPP.equals(channel)) return whatsapp.sendCode(target, code);
        return mailTo(target, "Tu código para reservar en " + clinicName,
                "Tu código es " + code + ". Vence en 10 minutos.\n\nSi no pediste esta cita, ignora este mensaje: no quedará ninguna reserva.");
    }

    /** Aviso informativo: si falla, no deshace lo que ya se decidió. */
    void notice(String channel, String target, String subject, String text) {
        boolean sent = WHATSAPP.equals(channel) ? whatsapp.sendNotice(target, text.replaceAll("\\s+", " ").strip()) : mailTo(target, subject, text);
        if (!sent) log.warn("No se pudo enviar un aviso de reserva por {}", channel);
    }

    private boolean mailTo(String to, String subject, String text) {
        if (!mail.configured()) return false;
        try {
            mail.send(to, subject, text + "\n\n— Enviado por Occlus en nombre de la clínica.");
            return true;
        } catch (Exception e) {
            log.warn("No se pudo enviar un correo de reserva: {}", e.getClass().getSimpleName());
            return false;
        }
    }
}
