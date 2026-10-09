package lat.occlus.platform;

public enum SubscriptionStatus {
    /** Periodo de prueba sin cobro. */
    TRIAL,
    /** Al día. */
    ACTIVE,
    /** Venció el periodo o falló el cobro; sigue funcionando durante el periodo de gracia. */
    PAST_DUE,
    /** Sin acceso por falta de pago o por decisión del administrador. */
    SUSPENDED,
    /** Terminada: sin acceso. */
    CANCELLED
}
