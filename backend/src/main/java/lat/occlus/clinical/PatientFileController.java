package lat.occlus.clinical;

import lat.occlus.platform.AppModule;
import lat.occlus.platform.RequiresModule;

import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import lat.occlus.clinical.FileDtos.FileResponse;
import lat.occlus.clinical.FileDtos.RemoveFileRequest;
import lat.occlus.shared.security.AuthUser;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** Radiografías, fotos y documentos del paciente. Mismo acceso que la historia clínica. */
@RequiresModule(AppModule.CLINICAL_RECORD)
@RestController
@PreAuthorize(ClinicalAccess.CAN_READ)
@RequiredArgsConstructor
public class PatientFileController {

    private final PatientFileService service;

    @GetMapping("/api/patients/{patientId}/files")
    List<FileResponse> list(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID patientId) {
        return service.list(AuthUser.from(jwt).clinicId(), patientId);
    }

    @PostMapping(path = "/api/patients/{patientId}/files", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    FileResponse upload(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID patientId,
                        @RequestPart("file") MultipartFile file,
                        @RequestParam FileCategory category,
                        @RequestParam(required = false) String title) {
        return service.upload(AuthUser.from(jwt), patientId, file, category, title);
    }

    /** Contenido del archivo. Se sirve en línea (para ver la imagen o el PDF en el navegador). */
    @GetMapping("/api/files/{id}/content")
    ResponseEntity<InputStreamResource> content(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        var content = service.open(AuthUser.from(jwt).clinicId(), id);
        var f = content.file();
        String filename = f.getOriginalFilename() != null ? f.getOriginalFilename() : f.getTitle();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(f.getContentType()))
                .contentLength(f.getSizeBytes())
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.inline().filename(filename, StandardCharsets.UTF_8).build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CACHE_CONTROL, "private, max-age=300")
                .body(new InputStreamResource(content.stream()));
    }

    @PostMapping("/api/files/{id}/remove")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void remove(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody RemoveFileRequest req) {
        service.remove(AuthUser.from(jwt), id, req.reason());
    }
}
