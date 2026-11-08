package lat.occlus.dictation;

import java.net.URI;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** occlus.dictation.* — dictado por voz en un servicio externo, para los equipos que no lo pueden hacer solos. */
@ConfigurationProperties(prefix = "occlus.dictation")
record DictationProperties(String groqApiKey, URI groqUrl, String model, int monthlyMinutesPerClinic) {

    boolean remoteConfigured() {
        return groqApiKey != null && !groqApiKey.isBlank();
    }

    @Override
    public String toString() {
        return "DictationProperties[groqUrl=" + groqUrl + ", model=" + model + ", credentials=REDACTED]";
    }
}
