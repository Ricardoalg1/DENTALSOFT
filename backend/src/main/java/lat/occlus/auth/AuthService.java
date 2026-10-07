package lat.occlus.auth;

import java.util.UUID;
import lat.occlus.auth.AuthDtos.LoginRequest;
import lat.occlus.auth.AuthDtos.MeResponse;
import lat.occlus.auth.AuthDtos.RegisterRequest;
import lat.occlus.auth.AuthDtos.TokenResponse;
import lat.occlus.clinic.Clinic;
import lat.occlus.clinic.ClinicRepository;
import lat.occlus.shared.security.TokenService;
import lat.occlus.shared.tenant.TenantContext;
import lat.occlus.shared.web.NotFoundException;
import lat.occlus.site.Site;
import lat.occlus.site.SiteRepository;
import lat.occlus.user.AppUser;
import lat.occlus.user.AppUserRepository;
import lat.occlus.user.Role;
import lat.occlus.user.UserDtos.CreateUserRequest;
import lat.occlus.user.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final ClinicRepository clinics;
    private final SiteRepository sites;
    private final AppUserRepository users;
    private final UserService userService;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokenService;
    private final TransactionTemplate tx;

    /**
     * Crea clínica + sede principal + administrador. El id de la clínica se genera aquí para
     * abrir la transacción YA dentro del contexto de esa clínica (RLS exige que coincida).
     */
    public TokenResponse register(RegisterRequest req) {
        userService.ensureEmailAvailable(req.email());
        UUID clinicId = UUID.randomUUID();

        AppUser admin = TenantContext.callAs(clinicId, () -> tx.execute(status -> {
            clinics.save(new Clinic(clinicId, req.clinicName().trim(), blankToNull(req.nit())));

            var site = new Site();
            site.setClinicId(clinicId);
            site.setName("Sede principal");
            sites.save(site);

            return users.save(userService.newUser(clinicId,
                    new CreateUserRequest(req.email(), req.fullName(), Role.ADMIN, req.password())));
        }));
        return toResponse(admin);
    }

    /** El login busca por correo entre todas las clínicas: única consulta en modo sistema. */
    public TokenResponse login(LoginRequest req) {
        var user = TenantContext.callAsSystem(() -> users.findByEmail(AppUser.normalizeEmail(req.email())))
                .filter(AppUser::isActive)
                .filter(u -> passwordEncoder.matches(req.password(), u.getPasswordHash()))
                .orElseThrow(() -> new BadCredentialsException("invalid credentials"));
        return toResponse(user);
    }

    @Transactional(readOnly = true)
    public MeResponse me(UUID userId) {
        var user = users.findById(userId).orElseThrow(() -> new NotFoundException("Usuario no encontrado"));
        var clinic = clinics.findById(user.getClinicId()).orElseThrow();
        return new MeResponse(user.getId(), user.getEmail(), user.getFullName(), user.getRole(), user.isProfessional(),
                clinic.getId(), clinic.getName());
    }

    private TokenResponse toResponse(AppUser user) {
        var token = tokenService.issue(user);
        return new TokenResponse(token.value(), token.expiresAt());
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
