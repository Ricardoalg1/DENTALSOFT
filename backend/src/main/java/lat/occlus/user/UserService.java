package lat.occlus.user;

import java.util.List;
import java.util.UUID;
import lat.occlus.shared.web.ConflictException;
import lat.occlus.shared.web.NotFoundException;
import lat.occlus.user.UserDtos.CreateUserRequest;
import lat.occlus.user.UserDtos.UpdateUserRequest;
import lat.occlus.user.UserDtos.UserResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class UserService {

    private final AppUserRepository users;
    private final PasswordEncoder passwordEncoder;

    @Transactional(readOnly = true)
    public List<UserResponse> list(UUID clinicId) {
        return users.findByClinicIdOrderByFullName(clinicId).stream().map(UserResponse::from).toList();
    }

    @Transactional
    public AppUser create(UUID clinicId, CreateUserRequest req) {
        String email = AppUser.normalizeEmail(req.email());
        if (users.existsByEmail(email)) {
            throw new ConflictException("Ya existe un usuario con ese correo");
        }
        var user = new AppUser();
        user.setClinicId(clinicId);
        user.setEmail(email);
        user.setFullName(req.fullName().trim());
        user.setRole(req.role());
        user.setPasswordHash(passwordEncoder.encode(req.password()));
        return users.save(user);
    }

    @Transactional
    public UserResponse update(UUID clinicId, UUID userId, UUID actingUserId, UpdateUserRequest req) {
        // Buscar por id Y clinicId evita que una clínica toque usuarios de otra.
        var user = users.findByIdAndClinicId(userId, clinicId)
                .orElseThrow(() -> new NotFoundException("Usuario no encontrado"));
        boolean self = user.getId().equals(actingUserId);
        if (self && (Boolean.FALSE.equals(req.active()) || (req.role() != null && req.role() != Role.ADMIN))) {
            throw new ConflictException("No puedes desactivarte ni quitarte el rol de administrador");
        }
        if (req.fullName() != null && !req.fullName().isBlank()) user.setFullName(req.fullName().trim());
        if (req.role() != null) user.setRole(req.role());
        if (req.active() != null) user.setActive(req.active());
        return UserResponse.from(user);
    }
}
