package lat.occlus.platform;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * occlus.platform.*
 *
 * @param selfRegistration  permite que cualquiera cree una clínica de prueba en /api/auth/register.
 *                          En producción debe ir en false: los clientes los crea el administrador.
 * @param graceDays         días que una clínica sigue funcionando después de vencer o fallar un cobro.
 * @param selfServiceTrialDays duración de la prueba de las clínicas que se registran solas.
 * @param schedulerEnabled  activa el proceso automático de renovaciones, suspensiones y avisos.
 * @param gateway           pasarela de cobro. Hoy solo existe "simulated" (no mueve dinero real).
 */
@ConfigurationProperties("occlus.platform")
public record PlatformProperties(boolean selfRegistration, int graceDays, int selfServiceTrialDays,
                                 boolean schedulerEnabled, String gateway) {

    public PlatformProperties {
        if (graceDays < 0 || graceDays > 60) throw new IllegalArgumentException("occlus.platform.grace-days fuera de rango");
        if (selfServiceTrialDays < 1 || selfServiceTrialDays > 90) {
            throw new IllegalArgumentException("occlus.platform.self-service-trial-days fuera de rango");
        }
        if (gateway == null || gateway.isBlank()) gateway = "simulated";
        // Fallar al arrancar es preferible a creer que se está cobrando con una pasarela que no existe.
        if (!gateway.equals("simulated")) {
            throw new IllegalArgumentException("occlus.platform.gateway=%s no está soportada: hoy solo existe «simulated»."
                    .formatted(gateway));
        }
    }
}
