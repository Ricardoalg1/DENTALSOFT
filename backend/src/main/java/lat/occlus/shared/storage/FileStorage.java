package lat.occlus.shared.storage;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchBucketException;
import software.amazon.awssdk.services.s3.model.S3Exception;

/** Guarda y lee archivos en el bucket configurado. Las claves las decide quien llama. */
@Slf4j
@Component
@RequiredArgsConstructor
public class FileStorage {

    private final S3Client s3;
    private final StorageProperties props;

    public void put(String key, byte[] content, String contentType) {
        s3.putObject(b -> b.bucket(props.bucket()).key(key).contentType(contentType).contentLength((long) content.length),
                RequestBody.fromBytes(content));
    }

    public ResponseInputStream<GetObjectResponse> get(String key) {
        return s3.getObject(b -> b.bucket(props.bucket()).key(key));
    }

    /** Solo para deshacer una subida cuyo registro en la BD falló (los archivos clínicos no se borran). */
    public void deleteQuietly(String key) {
        try {
            s3.deleteObject(b -> b.bucket(props.bucket()).key(key));
        } catch (RuntimeException e) {
            log.warn("No se pudo borrar el objeto huérfano {}", key, e);
        }
    }

    /** En desarrollo crea el bucket si no existe. En producción ya existe y esto no hace nada. */
    @EventListener(ApplicationReadyEvent.class)
    void ensureBucket() {
        try {
            s3.headBucket(b -> b.bucket(props.bucket()));
        } catch (NoSuchBucketException e) {
            s3.createBucket(b -> b.bucket(props.bucket()));
            log.info("Bucket {} creado", props.bucket());
        } catch (S3Exception e) {
            if (e.statusCode() == 404) {
                s3.createBucket(b -> b.bucket(props.bucket()));
                log.info("Bucket {} creado", props.bucket());
            } else {
                log.warn("No se pudo verificar el bucket {}: {}", props.bucket(), e.getMessage());
            }
        } catch (RuntimeException e) {
            log.warn("Almacenamiento no disponible ({}); los archivos fallarán hasta que lo esté", e.getMessage());
        }
    }
}
