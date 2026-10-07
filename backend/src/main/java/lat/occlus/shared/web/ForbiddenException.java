package lat.occlus.shared.web;

/** El usuario está autenticado pero no puede hacer esta acción (HTTP 403). */
public class ForbiddenException extends RuntimeException {
    public ForbiddenException(String message) {
        super(message);
    }
}
