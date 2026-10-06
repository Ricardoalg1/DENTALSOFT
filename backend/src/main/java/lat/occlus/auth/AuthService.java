package lat.occlus.auth;

import java.util.UUID;
import lat.occlus.auth.AuthDtos.LoginRequest;
import lat.occlus.auth.AuthDtos.MeResponse;
import lat.occlus.auth.AuthDtos.RegisterRequest;
import lat.occlus.auth.AuthDtos.TokenResponse;
import lat.occlus.clinic.Clinic;
import lat.occlus.clinic.ClinicRepository;
import lat.occlus.shared.security.TokenService;
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

@Service
@RequiredArgsConstructor
public class AuthService {

    private final ClinicRepository clinics;
    private final SiteRepository sites;
    private final AppUserRepository users;
    private final UserService userService;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokenService;

    /** Crea clínica + sede principal + administrador en una sola transacción. */
    @Transactional
    public TokenResponse register(RegisterRequest req) {
        var clinic = clinics.save(new Clinic(req.clinicName().trim(), blankToNull(req.nit())));

        var site = new Site();
        site.setClinicId(clinic.getId());
        site.setName("Sede principal");
        sites.save(site);

        AppUser admin = userService.create(clinic.getId(),
                new CreateUserRequest(req.email(), req.fullName(), Role.ADMIN, req.password()));
        return toResponse(admin);
    }

    @Transactional(readOnly = true)
    public TokenResponse login(LoginRequest req) {
        var user = users.findByEmail(AppUser.normalizeEmail(req.email()))
                .filter(AppUser::isActive)
                .filter(u -> passwordEncoder.matches(req.password(), u.getPasswordHash()))
                .orElseThrow(() -> new BadCredentialsException("invalid credentials"));
        return toResponse(user);
    }

    @Transactional(readOnly = true)
    public MeResponse me(UUID userId) {
        var user = users.findById(userId).orElseThrow(() -> new NotFoundException("Usuario no encontrado"));
        var clinic = clinics.findById(user.getClinicId()).orElseThrow();
        return new MeResponse(user.getId(), user.getEmail(), user.getFullName(), user.getRole(),
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
