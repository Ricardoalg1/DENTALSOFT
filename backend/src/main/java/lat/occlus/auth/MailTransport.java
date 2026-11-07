package lat.occlus.auth;

/** Entrega de un correo de texto. Separado para que las pruebas lo reemplacen. */
public interface MailTransport {
    boolean configured();

    void send(String to, String subject, String text) throws Exception;
}
