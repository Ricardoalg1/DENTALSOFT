package lat.occlus.auth;

import lat.occlus.platform.SkipEntitlements;

import jakarta.validation.Valid;
import lat.occlus.auth.AuthDtos.LoginRequest;
import lat.occlus.auth.AuthDtos.MeResponse;
import lat.occlus.auth.AuthDtos.RegisterRequest;
import lat.occlus.auth.AuthDtos.TokenResponse;
import lat.occlus.shared.security.AuthUser;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@SkipEntitlements
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService service;
    private final SessionService sessions;

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    TokenResponse register(@Valid @RequestBody RegisterRequest req) {
        return service.register(req);
    }

    @PostMapping("/login")
    TokenResponse login(@Valid @RequestBody LoginRequest req) {
        return service.login(req);
    }

    /** Cambia la contraseña y devuelve un token nuevo (sin la marca de contraseña temporal). */
    @PostMapping("/change-password")
    TokenResponse changePassword(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AuthDtos.ChangePasswordRequest req) {
        return service.changePassword(AuthUser.from(jwt).userId(), req);
    }

    /** Cierra esta sesión en el servidor (no solo borra la cookie): el token deja de valer. */
    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void logout(@AuthenticationPrincipal Jwt jwt) {
        sessions.revoke(AuthUser.from(jwt).userId(), AuthUser.sessionId(jwt), "LOGOUT");
    }

    @GetMapping("/sessions")
    java.util.List<SessionService.SessionInfo> sessions(@AuthenticationPrincipal Jwt jwt) {
        return sessions.list(AuthUser.from(jwt).userId(), AuthUser.sessionId(jwt));
    }

    @DeleteMapping("/sessions/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void revokeSession(@AuthenticationPrincipal Jwt jwt, @PathVariable java.util.UUID id) {
        sessions.revoke(AuthUser.from(jwt).userId(), id, "REVOKED_BY_USER");
    }

    /** «Cerrar las demás sesiones»: conserva solo la actual. */
    @PostMapping("/sessions/revoke-others")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void revokeOthers(@AuthenticationPrincipal Jwt jwt) {
        sessions.revokeAll(AuthUser.from(jwt).userId(), AuthUser.sessionId(jwt), "REVOKED_BY_USER");
    }

    @GetMapping("/me")
    MeResponse me(@AuthenticationPrincipal Jwt jwt) {
        return service.me(AuthUser.from(jwt).userId());
    }
}
