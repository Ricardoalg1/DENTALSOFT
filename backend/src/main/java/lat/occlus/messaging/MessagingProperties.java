package lat.occlus.messaging;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** occlus.messaging.* — WhatsApp (Meta Cloud API) y asistente de IA (Claude). */
@ConfigurationProperties(prefix = "occlus.messaging")
public record MessagingProperties(
        boolean schedulerEnabled,
        Duration reminderInterval,
        Duration inboundInterval,
        WhatsApp whatsapp,
        Ai ai) {

    public record WhatsApp(boolean liveEnabled, java.util.UUID clinicId, String accessToken, String phoneNumberId, String appSecret, String verifyToken,
                           String apiVersion, String reminderTemplate, String templateLanguage) {

        /** Con token y número configurados se envía de verdad; si no, modo simulado. */
        public boolean configured() {
            return liveEnabled && clinicId != null && notBlank(accessToken) && notBlank(phoneNumberId)
                    && notBlank(appSecret) && notBlank(verifyToken);
        }
        @Override public String toString() { return "WhatsApp[credentials=REDACTED]"; }
    }

    public record Ai(boolean enabled, String apiKey, String model) {

        public boolean configured() {
            return enabled && notBlank(apiKey) && notBlank(model);
        }
        @Override public String toString() { return "Ai[credentials=REDACTED]"; }
    }

    static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }
}
