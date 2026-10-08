package lat.occlus.messaging;

import java.util.List;

/** Canal de salida (WhatsApp real o simulado). */
public interface MessageSender {

    /** Mensaje de plantilla aprobada por Meta (obligatorio para iniciar una conversación). */
    SendResult sendTemplate(String to, String template, String language, List<String> bodyParams);

    /** Texto libre: Meta solo lo permite dentro de las 24 h siguientes a un mensaje del paciente. */
    SendResult sendText(String to, String text);

    boolean simulated();

    record SendResult(boolean ok, String providerMessageId, String error) {

        static SendResult ok(String id) {
            return new SendResult(true, id, null);
        }

        static SendResult failed(String error) {
            return new SendResult(false, null, error == null ? "Error desconocido" : error.substring(0, Math.min(error.length(), 500)));
        }
    }
}
