package lat.occlus.billing;

import java.util.UUID;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Credenciales exclusivamente en el servidor. Nunca serializar este objeto. */
@ConfigurationProperties("occlus.dataico")
public record DataicoProperties(String authToken, String accountId, UUID clinicId,
        String environment, String prefix, String resolutionNumber) {
    public boolean configured() {
        return clinicId != null && present(authToken) && present(accountId);
    }
    private static boolean present(String value) { return value != null && !value.isBlank(); }
    @Override public String toString() { return "DataicoProperties[credentials=REDACTED]"; }
}
