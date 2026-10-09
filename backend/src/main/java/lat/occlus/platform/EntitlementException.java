package lat.occlus.platform;

/** La clínica no puede usar este recurso por su suscripción (HTTP 403 con un código legible por máquina). */
public class EntitlementException extends RuntimeException {

    public static final String MODULE_DISABLED = "MODULE_DISABLED";
    public static final String SUBSCRIPTION_INACTIVE = "SUBSCRIPTION_INACTIVE";
    public static final String PASSWORD_CHANGE_REQUIRED = "PASSWORD_CHANGE_REQUIRED";

    private final String code;
    private final AppModule module;

    public EntitlementException(String code, String message, AppModule module) {
        super(message);
        this.code = code;
        this.module = module;
    }

    public String code() {
        return code;
    }

    public AppModule module() {
        return module;
    }
}
