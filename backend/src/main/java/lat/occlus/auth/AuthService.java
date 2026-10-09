package lat.occlus.auth;

import java.time.Instant;
import java.util.UUID;
import lat.occlus.auth.AuthDtos.ChangePasswordRequest;
import lat.occlus.auth.AuthDtos.LoginRequest;
import lat.occlus.auth.AuthDtos.MeResponse;
import lat.occlus.auth.AuthDtos.RegisterRequest;
import lat.occlus.auth.AuthDtos.SubscriptionInfo;
import lat.occlus.auth.AuthDtos.TokenResponse;
import lat.occlus.clinic.ClinicRepository;
import lat.occlus.platform.BillingCycle;
import lat.occlus.platform.Entitlements;
import lat.occlus.platform.PlatformGate;
import lat.occlus.platform.PlatformProperties;
import lat.occlus.platform.ProvisioningService;
import lat.occlus.platform.Subscription;
import lat.occlus.shared.security.TokenService;
import lat.occlus.shared.tenant.TenantContext;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.ForbiddenException;
import lat.occlus.shared.web.NotFoundException;
import lat.occlus.user.AppUser;
import lat.occlus.user.AppUserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final ClinicRepository clinics;
    private final AppUserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokenService;
    private final ProvisioningService provisioning;
    private final Entitlements entitlements;
    private final PlatformGate platformGate;
    private final PlatformProperties platform;

    /**
     * Registro de una clínica de prueba. Solo si {@code occlus.platform.self-registration} está
     * activo (en producción los clientes los crea el administrador desde el panel).
     */
    public TokenResponse register(RegisterRequest req) {
        if (!platform.selfRegistration()) {
            throw new ForbiddenException("El registro público está deshabilitado. Solicita tu cuenta al equipo de Occlus.");
        }
        var result = provisioning.provision(new ProvisioningService.Request(
                req.clinicName(), req.nit(), req.fullName(), req.email(), req.password(), false,
                "INTEGRAL", BillingCycle.MONTHLY, null, null, null, platform.selfServiceTrialDays(), null,
                ProvisioningService.ClientData.none(), "SELF_SERVICE"), null);
        var admin = TenantContext.callAsSystem(() -> users.findById(result.adminId()).orElseThrow());
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

    @Transactional
    public TokenResponse changePassword(UUID userId, ChangePasswordRequest req) {
        var user = users.findById(userId).orElseThrow(() -> new NotFoundException("Usuario no encontrado"));
        // 400 y no 401: un 401 haría que la interfaz crea que la sesión venció y la cierre.
        if (!passwordEncoder.matches(req.currentPassword(), user.getPasswordHash())) {
            throw new BadRequestException("La contraseña actual no es correcta.");
        }
        if (req.currentPassword().equals(req.newPassword())) {
            throw new BadRequestException("La nueva contraseña debe ser diferente de la actual.");
        }
        user.setPasswordHash(passwordEncoder.encode(req.newPassword()));
        user.setPasswordChangeRequired(false);
        return toResponse(user);
    }

    @Transactional(readOnly = true)
    public MeResponse me(UUID userId) {
        var user = users.findById(userId).orElseThrow(() -> new NotFoundException("Usuario no encontrado"));
        var clinic = clinics.findById(user.getClinicId()).orElseThrow();
        var sub = entitlements.find(clinic.getId()).orElse(null);
        var info = subscriptionInfo(sub);
        return new MeResponse(user.getId(), user.getEmail(), user.getFullName(), user.getRole(), user.isProfessional(),
                clinic.getId(), clinic.getName(),
                sub == null || !info.accessAllowed() ? java.util.List.of()
                        : sub.modules().stream().map(Enum::name).sorted().toList(),
                info, user.isPasswordChangeRequired(), platformGate.isListed(user.getId(), user.getRole()));
    }

    private SubscriptionInfo subscriptionInfo(Subscription sub) {
        if (sub == null) {
            return new SubscriptionInfo("NONE", null, null, null, null, null, false, false, false,
                    Entitlements.inactiveMessage(null));
        }
        var access = sub.access(Instant.now(), entitlements.grace());
        return new SubscriptionInfo(sub.status().name(), sub.planCode(), sub.planName(), sub.trialEndsAt(),
                sub.currentPeriodEnd(), access.until(), access.inGrace(), sub.cancelAtPeriodEnd(), access.allowed(),
                access.allowed() ? null : Entitlements.inactiveMessage(access.reason()));
    }

    private TokenResponse toResponse(AppUser user) {
        var token = tokenService.issue(user);
        return new TokenResponse(token.value(), token.expiresAt());
    }
}
