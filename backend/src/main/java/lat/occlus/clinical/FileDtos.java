package lat.occlus.clinical;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;
import lat.occlus.clinical.ClinicalDtos.Ref;

public final class FileDtos {

    private FileDtos() {}

    public record FileResponse(
            UUID id, FileCategory category, String title, String originalFilename, String contentType,
            long sizeBytes, Instant createdAt, Ref uploadedBy) {}

    public record RemoveFileRequest(@NotBlank @Size(max = 200) String reason) {}

    /** Contenido para descargar/mostrar. */
    public record FileContent(PatientFile file, java.io.InputStream stream) {}
}
