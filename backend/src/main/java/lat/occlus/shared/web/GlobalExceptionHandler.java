package lat.occlus.shared.web;

import java.util.Map;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Traduce excepciones a respuestas RFC 9457 (application/problem+json).
 * Los errores de validación (@Valid) ya los maneja la clase padre con 400.
 */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    @ExceptionHandler(NotFoundException.class)
    ProblemDetail notFound(NotFoundException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
    }

    @ExceptionHandler(ConflictException.class)
    ProblemDetail conflict(ConflictException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, ex.getMessage());
    }

    @ExceptionHandler(ForbiddenException.class)
    ProblemDetail forbidden(ForbiddenException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, ex.getMessage());
    }

    @ExceptionHandler(BadRequestException.class)
    ProblemDetail badRequest(BadRequestException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, ex.getMessage());
    }

    /** Mensajes para restricciones de la BD que el usuario puede provocar en una carrera. */
    private static final Map<String, String> CONSTRAINT_MESSAGES = Map.of(
            "ex_appointment_dentist_overlap", "El profesional ya tiene una cita en ese horario",
            "uq_patient_document", "Ya existe un paciente con ese documento",
            "ux_app_user_email", "Ya existe un usuario con ese correo",
            "ux_clinical_note_appointment", "Esa cita ya tiene una evolución",
            "ux_odontogram_surface", "Otra persona acaba de modificar ese diente. Recarga el odontograma.",
            "ux_odontogram_tooth", "Otra persona acaba de modificar ese diente. Recarga el odontograma.",
            // Lo lanza el trigger tg_clinical_note_immutable.
            "está firmada y no se puede modificar", "La evolución está firmada y no se puede modificar");

    /** Respaldo para carreras que la validación previa no alcanza a ver (índices únicos, exclusiones). */
    @ExceptionHandler(DataIntegrityViolationException.class)
    ProblemDetail dataIntegrity(DataIntegrityViolationException ex) {
        String cause = String.valueOf(ex.getMostSpecificCause().getMessage());
        String detail = CONSTRAINT_MESSAGES.entrySet().stream()
                .filter(e -> cause.contains(e.getKey()))
                .map(Map.Entry::getValue)
                .findFirst()
                .orElse("El registro entra en conflicto con uno existente");
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, detail);
    }

    @ExceptionHandler(BadCredentialsException.class)
    ProblemDetail badCredentials() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, "Correo o contraseña incorrectos");
    }
}
