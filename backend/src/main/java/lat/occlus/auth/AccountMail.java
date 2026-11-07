package lat.occlus.auth;

import jakarta.annotation.PreDestroy;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Correos de seguridad de la cuenta, siempre fuera del hilo de la petición: el tiempo de respuesta no debe
 * revelar si un correo está registrado, y un proveedor lento no debe frenar el ingreso.
 * Los registros nunca incluyen el destinatario ni el enlace.
 */
@Component
@Slf4j
class AccountMail {

    private final MailTransport transport;
    private final String appUrl;
    private final ThreadPoolExecutor worker = new ThreadPoolExecutor(1, 2, 60, TimeUnit.SECONDS, new ArrayBlockingQueue<>(200));

    AccountMail(MailTransport transport, @Value("${occlus.account-security.app-url:}") String appUrl) {
        this.transport = transport;
        this.appUrl = appUrl.endsWith("/") ? appUrl.substring(0, appUrl.length() - 1) : appUrl;
    }

    /** La dirección viene de la configuración, nunca de la cabecera Host: un atacante no puede desviar el enlace. */
    boolean available() {
        boolean safeUrl = appUrl.startsWith("https://") || appUrl.startsWith("http://localhost");
        return transport.configured() && safeUrl;
    }

    String resetLink(String token) {
        // El token va en el fragmento (#): el navegador no lo envía a ningún servidor ni aparece en registros.
        return appUrl + "/restablecer#t=" + token;
    }

    void submit(Runnable job) {
        try {
            worker.execute(() -> {
                try {
                    job.run();
                } catch (RuntimeException e) {
                    log.error("Falló una tarea de correo de seguridad: {}", e.getClass().getSimpleName());
                }
            });
        } catch (RejectedExecutionException e) {
            log.warn("Cola de correos de seguridad llena: se descarta una tarea");
        }
    }

    /** Aviso informativo: si no se puede enviar, no debe impedir la operación que lo originó. */
    void notice(String to, String subject, String text) {
        submit(() -> deliver(to, subject, text));
    }

    void deliver(String to, String subject, String text) {
        if (!transport.configured()) {
            log.warn("Correo de seguridad sin enviar: falta configurar el proveedor");
            return;
        }
        try {
            transport.send(to, subject, text + "\n\n— Occlus\nEste es un mensaje automático. Nunca te pediremos tu contraseña ni tus códigos.");
        } catch (Exception e) {
            log.error("No se pudo enviar un correo de seguridad: {}", e.getClass().getSimpleName());
        }
    }

    @PreDestroy
    void stop() {
        worker.shutdown();
    }
}
