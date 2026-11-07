package lat.occlus.messaging;

import java.util.Optional;

/** Mensajes a personas que aún no son pacientes (reserva en línea), por el número de WhatsApp de la plataforma. */
public interface PatientWhatsApp {
    boolean available();

    /** Celular colombiano listo para el API; vacío si el número no sirve para WhatsApp. */
    Optional<String> normalize(String phone);

    boolean sendCode(String phone, String code);

    boolean sendNotice(String phone, String text);
}
