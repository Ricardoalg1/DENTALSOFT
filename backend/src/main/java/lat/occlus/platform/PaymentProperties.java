package lat.occlus.platform;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * occlus.payments.*: pasarelas con las que se cobra la suscripción. Los secretos viven solo en
 * variables de entorno y nunca se imprimen (los {@code toString} los ocultan).
 *
 * @param simulated activa la pasarela de pruebas (no mueve dinero). Debe ir en false en producción.
 * @param publicUrl dirección pública de la aplicación (https://occlus.lat): a ella regresa la persona
 *                  tras pagar y a ella llaman los webhooks de las pasarelas.
 */
@ConfigurationProperties("occlus.payments")
public record PaymentProperties(boolean simulated, String publicUrl, Wompi wompi, Epayco epayco) {

    public PaymentProperties {
        wompi = wompi == null ? new Wompi(false, "sandbox", null, null, null, null, null) : wompi;
        epayco = epayco == null ? new Epayco(false, null, null, null, true, null) : epayco;
        if (wompi.enabled() || epayco.enabled()) {
            if (publicUrl == null || !publicUrl.matches("https?://[^/\\s]+")) {
                throw new IllegalArgumentException(
                        "occlus.payments.public-url debe ser la dirección base (https://occlus.lat, sin barra final)");
            }
        }
    }

    /** Hay al menos una pasarela real activa. */
    public boolean anyLive() {
        return wompi.enabled() || epayco.enabled();
    }

    private static void require(boolean ok, String message) {
        if (!ok) throw new IllegalArgumentException(message);
    }

    private static boolean has(String s) {
        return s != null && !s.isBlank();
    }

    /**
     * @param environment «sandbox» o «production». Las llaves deben corresponder (pub_test_/prv_test_ o
     *                    pub_prod_/prv_prod_): mezclar ambientes es un error de configuración, y se rechaza al arrancar.
     * @param baseUrl     opcional; por defecto la API de Wompi del ambiente.
     */
    public record Wompi(boolean enabled, String environment, String publicKey, String privateKey, String eventsSecret,
                        String integritySecret, String baseUrl) {

        public Wompi {
            if (!has(environment)) environment = "sandbox";
            if (enabled) {
                require(environment.equals("sandbox") || environment.equals("production"),
                        "occlus.payments.wompi.environment debe ser sandbox o production");
                require(has(publicKey) && has(privateKey) && has(eventsSecret) && has(integritySecret),
                        "Wompi activado: faltan llaves (public-key, private-key, events-secret, integrity-secret)");
                String tag = environment.equals("sandbox") ? "test" : "prod";
                require(publicKey.startsWith("pub_" + tag + "_") && privateKey.startsWith("prv_" + tag + "_"),
                        "Las llaves de Wompi no corresponden al ambiente «%s»".formatted(environment));
                if (!has(baseUrl)) baseUrl = environment.equals("sandbox") ? "https://sandbox.wompi.co/v1" : "https://production.wompi.co/v1";
            }
        }

        @Override
        public String toString() {
            return "Wompi[enabled=%s, environment=%s]".formatted(enabled, environment);
        }
    }

    /**
     * @param customerId  P_CUST_ID_CLIENTE del panel de ePayco.
     * @param pKey        P_KEY del panel de ePayco (firma de las confirmaciones).
     * @param test        modo de pruebas del checkout.
     * @param validationUrl opcional; por defecto el servicio público de validación de ePayco.
     */
    public record Epayco(boolean enabled, String customerId, String publicKey, String pKey, boolean test, String validationUrl) {

        public Epayco {
            if (enabled) {
                require(has(customerId) && has(publicKey) && has(pKey),
                        "ePayco activado: faltan llaves (customer-id, public-key, p-key)");
                if (!has(validationUrl)) validationUrl = "https://secure.epayco.co/validation/v1/reference";
            }
        }

        @Override
        public String toString() {
            return "Epayco[enabled=%s, test=%s]".formatted(enabled, test);
        }
    }

    @Override
    public String toString() {
        return "PaymentProperties[simulated=%s, wompi=%s, epayco=%s]".formatted(simulated, wompi, epayco);
    }
}
