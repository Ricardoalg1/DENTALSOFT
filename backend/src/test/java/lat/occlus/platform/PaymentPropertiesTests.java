package lat.occlus.platform;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/** La configuración de pagos falla al arrancar antes que cobrar con llaves equivocadas. */
class PaymentPropertiesTests {

    private static PaymentProperties.Wompi wompi(String env, String pub, String prv) {
        return new PaymentProperties.Wompi(true, env, pub, prv, "ev", "int", null);
    }

    @Test
    void wompiNeedsAllKeysAndMatchingEnvironment() {
        assertThatThrownBy(() -> new PaymentProperties.Wompi(true, "sandbox", "pub_test_a", null, "e", "i", null))
                .hasMessageContaining("faltan llaves");
        // Llaves de pruebas en producción (o al revés): error de configuración.
        assertThatThrownBy(() -> wompi("production", "pub_test_a", "prv_test_a")).hasMessageContaining("ambiente");
        assertThatThrownBy(() -> wompi("sandbox", "pub_prod_a", "prv_prod_a")).hasMessageContaining("ambiente");
        assertThatThrownBy(() -> wompi("staging", "pub_test_a", "prv_test_a")).hasMessageContaining("environment");
        assertThat(wompi("sandbox", "pub_test_a", "prv_test_a").baseUrl()).isEqualTo("https://sandbox.wompi.co/v1");
        assertThat(wompi("production", "pub_prod_a", "prv_prod_a").baseUrl()).isEqualTo("https://production.wompi.co/v1");
    }

    @Test
    void anActiveGatewayNeedsAPublicUrl() {
        var live = wompi("sandbox", "pub_test_a", "prv_test_a");
        var off = new PaymentProperties.Epayco(false, null, null, null, true, null);
        assertThatThrownBy(() -> new PaymentProperties(false, "", live, off)).hasMessageContaining("public-url");
        assertThatThrownBy(() -> new PaymentProperties(false, "occlus.lat", live, off)).hasMessageContaining("public-url");
        assertThat(new PaymentProperties(false, "https://occlus.lat", live, off).anyLive()).isTrue();
        // Sin pasarelas reales no hace falta (solo pagos manuales o simulados).
        assertThat(new PaymentProperties(true, null, null, null).anyLive()).isFalse();
    }

    @Test
    void epaycoNeedsItsKeys() {
        assertThatThrownBy(() -> new PaymentProperties.Epayco(true, "1", "pub", "", true, null)).hasMessageContaining("faltan llaves");
    }

    @Test
    void secretsNeverAppearInToString() {
        var w = new PaymentProperties.Wompi(true, "sandbox", "pub_test_PUBLIC", "prv_test_SECRETKEY", "SECRET_EVENTS", "SECRET_INTEGRITY", null);
        var e = new PaymentProperties.Epayco(true, "CUST", "PUBKEY", "SECRET_PKEY", true, null);
        String all = new PaymentProperties(false, "https://occlus.lat", w, e).toString() + w + e;
        assertThat(all).doesNotContain("SECRET").doesNotContain("prv_test").doesNotContain("PUBKEY");
    }
}
