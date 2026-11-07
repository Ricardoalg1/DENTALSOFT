package lat.occlus.booking;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** occlus.booking.* — reserva de citas en línea. */
@ConfigurationProperties(prefix = "occlus.booking")
record BookingProperties(String publicUrl, boolean captchaRequired, String turnstileSiteKey, String turnstileSecret) {

    boolean captchaConfigured() {
        return turnstileSecret != null && !turnstileSecret.isBlank() && turnstileSiteKey != null && !turnstileSiteKey.isBlank();
    }

    String baseUrl() {
        return publicUrl.endsWith("/") ? publicUrl.substring(0, publicUrl.length() - 1) : publicUrl;
    }

    @Override
    public String toString() {
        return "BookingProperties[publicUrl=" + publicUrl + ", credentials=REDACTED]";
    }
}
