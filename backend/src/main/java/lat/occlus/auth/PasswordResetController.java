package lat.occlus.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lat.occlus.platform.SkipEntitlements;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Público: quien olvidó su contraseña no tiene sesión. Todo va por POST para que el token nunca viaje en una URL. */
@SkipEntitlements
@RestController
@RequestMapping("/api/auth/password-reset")
@RequiredArgsConstructor
public class PasswordResetController {

    record ResetRequest(@NotBlank @Email @Size(max = 160) String email) {}
    record TokenRequest(@NotBlank @Size(max = 100) String token) {}
    record ConfirmRequest(@NotBlank @Size(max = 100) String token, @NotBlank @Size(max = 200) String newPassword, @Size(max = 32) String code) {}

    private final PasswordResetService service;

    @PostMapping("/request")
    @ResponseStatus(HttpStatus.ACCEPTED)
    void request(@Valid @RequestBody ResetRequest req) {
        service.request(req.email());
    }

    @PostMapping("/inspect")
    PasswordResetService.Inspection inspect(@Valid @RequestBody TokenRequest req) {
        return service.inspect(req.token());
    }

    @PostMapping("/confirm")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void confirm(@Valid @RequestBody ConfirmRequest req) {
        service.confirm(req.token(), req.newPassword(), req.code());
    }
}
