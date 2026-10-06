package lat.occlus.user;

import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.user.UserDtos.CreateUserRequest;
import lat.occlus.user.UserDtos.UpdateUserRequest;
import lat.occlus.user.UserDtos.UserResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Gestión del equipo de la clínica. Solo administradores. */
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class UserController {

    private final UserService service;

    @GetMapping
    List<UserResponse> list(@AuthenticationPrincipal Jwt jwt) {
        return service.list(AuthUser.from(jwt).clinicId());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    UserResponse create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateUserRequest req) {
        return UserResponse.from(service.create(AuthUser.from(jwt).clinicId(), req));
    }

    @PatchMapping("/{id}")
    UserResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody UpdateUserRequest req) {
        var me = AuthUser.from(jwt);
        return service.update(me.clinicId(), id, me.userId(), req);
    }
}
