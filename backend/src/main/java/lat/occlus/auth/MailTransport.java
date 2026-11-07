package lat.occlus.auth;

/** Entrega de un correo de texto. Separado para que las pruebas lo reemplacen. */
public interface MailTransport {
    boolean configured();

    void send(String to, String subject, String text) throws Exception;

    /** Con versión HTML. Quien no la soporte envía solo el texto. */
    default void send(String to, String subject, String text, String html) throws Exception {
        send(to, subject, text);
    }
}
