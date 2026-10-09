package lat.occlus.platform;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marca un controlador (o un método) como parte de un módulo opcional. El {@link EntitlementInterceptor}
 * rechaza con 403 las peticiones de clínicas que no tengan el módulo habilitado en su suscripción.
 *
 * <p>Un test revisa que todo controlador tenga esta anotación o esté en la lista de endpoints del
 * núcleo: no se puede agregar un endpoint nuevo sin decidir a qué módulo pertenece.
 */
@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface RequiresModule {
    AppModule value();
}
