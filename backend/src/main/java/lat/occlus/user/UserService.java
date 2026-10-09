package lat.occlus.user;

import java.util.List;
import java.util.UUID;
import lat.occlus.shared.tenant.TenantContext;
import lat.occlus.shared.web.ConflictException;
import lat.occlus.shared.web.NotFoundException;
import lat.occlus.user.UserDtos.CreateUserRequest;
import lat.occlus.user.UserDtos.ProfessionalResponse;
import lat.occlus.user.UserDtos.UpdateUserRequest;
import lat.occlus.user.UserDtos.UserResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import lat.occlus.platform.UserLimits;

@Service
@RequiredArgsConstructor
public class UserService {

    private final AppUserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final UserLimits limits;
    private final TransactionTemplate tx;

    @Transactional(readOnly = true)
    public List<ProfessionalResponse> professionals(UUID clinicId) {
        return users.findByClinicIdAndProfessionalTrueAndActiveTrueOrderByFullName(clinicId).stream()
                .map(u -> new ProfessionalResponse(u.getId(), u.getFullName()))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<UserResponse> list(UUID clinicId) {
        return users.findByClinicIdOrderByFullName(clinicId).stream().map(UserResponse::from).toList();
    }

    /**
     * Sin @Transactional a propósito: la verificación de correo corre en su propia transacción
     * en modo sistema (el correo es único entre TODAS las clínicas) y luego se guarda el usuario,
     * dentro de una transacción propia que además aplica el límite de usuarios del plan.
     */
    public AppUser create(UUID clinicId, CreateUserRequest req) {
        ensureEmailAvailable(req.email());
        return tx.execute(status -> {
            limits.lockAndCheck(clinicId, 1);
            return users.save(newUser(clinicId, req));
        });
    }

    public void ensureEmailAvailable(String email) {
        String normalized = AppUser.normalizeEmail(email);
        if (TenantContext.callAsSystem(() -> users.existsByEmail(normalized))) {
            throw new ConflictException("Ya existe un usuario con ese correo");
        }
    }

    public AppUser newUser(UUID clinicId, CreateUserRequest req) {
        var user = new AppUser();
        user.setClinicId(clinicId);
        user.setEmail(AppUser.normalizeEmail(req.email()));
        user.setFullName(req.fullName().trim());
        user.setRole(req.role());
        user.setPasswordHash(passwordEncoder.encode(req.password()));
        user.setProfessional(req.professional() != null
                ? req.professional()
                : req.role() == Role.DENTIST || req.role() == Role.ADMIN);
        return user;
    }

    @Transactional
    public UserResponse update(UUID clinicId, UUID userId, UUID actingUserId, UpdateUserRequest req) {
        // Buscar por id Y clinicId evita que una clínica toque usuarios de otra (RLS lo refuerza en la BD).
        var user = users.findByIdAndClinicId(userId, clinicId)
                .orElseThrow(() -> new NotFoundException("Usuario no encontrado"));
        boolean self = user.getId().equals(actingUserId);
        if (self && (Boolean.FALSE.equals(req.active()) || (req.role() != null && req.role() != Role.ADMIN))) {
            throw new ConflictException("No puedes desactivarte ni quitarte el rol de administrador");
        }
        if (req.fullName() != null && !req.fullName().isBlank()) user.setFullName(req.fullName().trim());
        if (req.role() != null) user.setRole(req.role());
        if (req.active() != null) {
            // Reactivar a alguien también cuenta contra el límite del plan.
            if (req.active() && !user.isActive()) limits.lockAndCheck(clinicId, 1);
            user.setActive(req.active());
        }
        if (req.professional() != null) user.setProfessional(req.professional());
        return UserResponse.from(user);
    }
}
