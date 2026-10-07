package lat.occlus.shared.storage;

import java.net.URI;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** occlus.storage.* — dónde se guardan los archivos (S3 o compatible). */
@ConfigurationProperties(prefix = "occlus.storage")
public record StorageProperties(
        /** Vacío = AWS S3 real; con valor = servicio compatible (SeaweedFS en local, s3mock en pruebas). */
        URI endpoint,
        String region,
        String bucket,
        String accessKey,
        String secretKey,
        boolean pathStyle) {}
