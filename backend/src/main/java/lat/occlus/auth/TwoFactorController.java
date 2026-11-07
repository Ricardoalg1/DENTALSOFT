package lat.occlus.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import lat.occlus.platform.SkipEntitlements;
import lat.occlus.shared.security.AuthUser;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Cada persona administra solo su propia verificación: ningún rol puede cambiarla por otra. */
@SkipEntitlements
@RestController
@RequestMapping("/api/auth/2fa")
@RequiredArgsConstructor
public class TwoFactorController {

    record PasswordRequest(@NotBlank @Size(max = 200) String password) {}
    record CodeRequest(@NotBlank @Size(max = 32) String code) {}
    record PasswordAndCodeRequest(@NotBlank @Size(max = 200) String password, @NotBlank @Size(max = 32) String code) {}
    record RecoveryCodes(List<String> codes) {}

    private final TwoFactorService service;

    @GetMapping
    TwoFactorService.Status status(@AuthenticationPrincipal Jwt jwt) {
        return service.status(AuthUser.from(jwt));
    }

    @PostMapping("/setup")
    TwoFactorService.Setup setup(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody PasswordRequest req) {
        return service.setup(AuthUser.from(jwt), req.password());
    }

    @PostMapping("/enable")
    RecoveryCodes enable(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CodeRequest req) {
        return new RecoveryCodes(service.enable(AuthUser.from(jwt), AuthUser.sessionId(jwt), req.code()));
    }

    @PostMapping("/disable")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void disable(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody PasswordAndCodeRequest req) {
        service.disable(AuthUser.from(jwt), AuthUser.sessionId(jwt), req.password(), req.code());
    }

    @PostMapping("/recovery-codes")
    RecoveryCodes recoveryCodes(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody PasswordAndCodeRequest req) {
        return new RecoveryCodes(service.regenerateRecoveryCodes(AuthUser.from(jwt), req.password(), req.code()));
    }
}
