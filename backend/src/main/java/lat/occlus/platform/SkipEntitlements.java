package lat.occlus.platform;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * El controlador no depende de la suscripción de la clínica: autenticación (para poder ver el
 * aviso de cuenta suspendida o cambiar la contraseña), endpoints de la plataforma y los que
 * consumen sistemas externos. Cada uno hace su propia autorización.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface SkipEntitlements {}
