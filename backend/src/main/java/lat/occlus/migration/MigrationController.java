package lat.occlus.migration;

import jakarta.validation.Valid;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;
import lat.occlus.migration.MigrationDtos.BatchRequest;
import lat.occlus.migration.MigrationDtos.BatchResponse;
import lat.occlus.migration.MigrationDtos.ImportReport;
import lat.occlus.migration.MigrationDtos.PatientImportRequest;
import lat.occlus.migration.MigrationDtos.SheetResponse;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.BadRequestException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * Migración desde otros programas: lectura del archivo, lotes e importación de pacientes (núcleo, sin
 * módulo). La historia clínica y los documentos están en {@link ClinicalMigrationController}.
 * Solo administradores: una importación toca muchos pacientes a la vez.
 */
@RestController
@RequestMapping("/api/migration")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
public class MigrationController {

    private final SheetReader sheets;
    private final MigrationBatches batches;
    private final PatientImportService patientImport;

    /** Lee el Excel o CSV y devuelve encabezados y filas como texto. No guarda nada. */
    @PostMapping(path = "/sheet", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    SheetResponse readSheet(@RequestPart("file") MultipartFile file) {
        if (file == null || file.isEmpty()) throw new BadRequestException("Selecciona un archivo");
        try {
            return sheets.read(file.getOriginalFilename(), file.getBytes());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @GetMapping("/batches")
    List<BatchResponse> batches(@AuthenticationPrincipal Jwt jwt) {
        return batches.list(AuthUser.from(jwt).clinicId());
    }

    @PostMapping("/batches")
    @ResponseStatus(HttpStatus.CREATED)
    BatchResponse createBatch(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody BatchRequest req) {
        return batches.create(AuthUser.from(jwt), req);
    }

    /** Valida (sin batchId) o importa (con batchId) una parte del archivo de pacientes. */
    @PostMapping("/patients")
    ImportReport importPatients(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody PatientImportRequest req) {
        return patientImport.importRows(AuthUser.from(jwt), req);
    }
}
