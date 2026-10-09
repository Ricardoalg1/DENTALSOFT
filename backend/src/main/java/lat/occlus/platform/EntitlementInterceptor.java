package lat.occlus.platform;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.security.TokenService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Único punto donde se aplica la suscripción a las peticiones autenticadas.
 *
 * <p>Se decide por el CONTROLADOR que resolvió la petición (no por la ruta), así que no se puede
 * esquivar con variantes de URL. Por defecto exige suscripción con acceso; si el controlador o el
 * método declaran {@link RequiresModule}, exige además ese módulo.
 */
@Component
@RequiredArgsConstructor
class EntitlementInterceptor implements HandlerInterceptor {

    private final Entitlements entitlements;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!(handler instanceof HandlerMethod method)) return true;
        if (method.getBeanType().isAnnotationPresent(SkipEntitlements.class)) return true;
        if (!(SecurityContextHolder.getContext().getAuthentication() instanceof JwtAuthenticationToken auth)) return true;

        var jwt = auth.getToken();
        // Contraseña temporal: hasta que la cambie no puede usar nada más.
        if (Boolean.TRUE.equals(jwt.getClaimAsBoolean(TokenService.CLAIM_PWD_CHANGE))) {
            throw new EntitlementException(EntitlementException.PASSWORD_CHANGE_REQUIRED,
                    "Debes cambiar tu contraseña temporal antes de continuar.", null);
        }
        entitlements.require(AuthUser.from(jwt).clinicId(), requiredModule(method));
        return true;
    }

    static AppModule requiredModule(HandlerMethod method) {
        var onMethod = AnnotatedElementUtils.findMergedAnnotation(method.getMethod(), RequiresModule.class);
        if (onMethod != null) return onMethod.value();
        var onClass = AnnotatedElementUtils.findMergedAnnotation(method.getBeanType(), RequiresModule.class);
        return onClass == null ? null : onClass.value();
    }
}
