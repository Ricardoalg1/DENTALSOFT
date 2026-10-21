package lat.occlus.migration;

import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lat.occlus.clinical.FileCategory;
import lat.occlus.migration.MigrationDtos.BatchResponse;
import lat.occlus.migration.MigrationDtos.ClinicalImportRequest;
import lat.occlus.migration.MigrationDtos.DocumentImportResponse;
import lat.occlus.migration.MigrationDtos.ImportReport;
import lat.occlus.migration.MigrationDtos.LegacyRecordResponse;
import lat.occlus.migration.MigrationDtos.VoidRequest;
import lat.occlus.patient.DocumentType;
import lat.occlus.platform.AppModule;
import lat.occlus.platform.RequiresModule;
import lat.occlus.shared.security.AuthUser;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** Migración de la historia clínica anterior y de los documentos de los pacientes. */
@RequiresModule(AppModule.CLINICAL_RECORD)
@RestController
@RequiredArgsConstructor
public class ClinicalMigrationController {

    private final ClinicalImportService service;

    /** Valida (sin batchId) o importa (con batchId) una parte del archivo de historia clínica. */
    @PostMapping("/api/migration/clinical-records")
    @PreAuthorize("hasRole('ADMIN')")
    ImportReport importRecords(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ClinicalImportRequest req) {
        return service.importRecords(AuthUser.from(jwt), req);
    }

    @PostMapping("/api/migration/batches/{id}/void")
    @PreAuthorize("hasRole('ADMIN')")
    BatchResponse voidBatch(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody VoidRequest req) {
        return service.voidBatch(AuthUser.from(jwt), id, req.reason());
    }

    /** Un documento (PDF o imagen) del programa anterior, para el paciente con ese número de documento. */
    @PostMapping(path = "/api/migration/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('ADMIN')")
    DocumentImportResponse importDocument(@AuthenticationPrincipal Jwt jwt,
                                          @RequestPart("file") MultipartFile file,
                                          @RequestParam UUID batchId,
                                          @RequestParam String documentNumber,
                                          @RequestParam(required = false) DocumentType documentType,
                                          @RequestParam(defaultValue = "DOCUMENT") FileCategory category) {
        return service.importDocument(AuthUser.from(jwt), batchId, documentNumber, documentType, category, file);
    }

    /** Historia del programa anterior de un paciente. Mismo acceso que la historia clínica (recepción no). */
    @GetMapping("/api/patients/{patientId}/legacy-records")
    @PreAuthorize("hasAnyRole('ADMIN', 'DENTIST', 'ASSISTANT')")
    List<LegacyRecordResponse> legacyRecords(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID patientId) {
        return service.byPatient(AuthUser.from(jwt).clinicId(), patientId);
    }
}
