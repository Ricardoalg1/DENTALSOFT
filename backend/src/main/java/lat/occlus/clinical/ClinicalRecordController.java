package lat.occlus.clinical;

import jakarta.validation.Valid;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lat.occlus.clinical.ClinicalDtos.AddendumRequest;
import lat.occlus.clinical.ClinicalDtos.BackgroundRequest;
import lat.occlus.clinical.ClinicalDtos.BackgroundResponse;
import lat.occlus.clinical.ClinicalDtos.Diagnosis;
import lat.occlus.clinical.ClinicalDtos.NoteRequest;
import lat.occlus.clinical.ClinicalDtos.NoteResponse;
import lat.occlus.clinical.ClinicalDtos.NoteSummary;
import lat.occlus.clinical.ClinicalDtos.OdontogramEntryResponse;
import lat.occlus.clinical.ClinicalDtos.OdontogramRequest;
import lat.occlus.shared.security.AuthUser;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Historia clínica: antecedentes, evoluciones y odontograma.
 * El @PreAuthorize de la clase deja fuera a recepción en TODOS los endpoints; escribir además
 * exige ser profesional (lo valida {@link ClinicalAccess} en los servicios).
 */
@RestController
@PreAuthorize(ClinicalAccess.CAN_READ)
@RequiredArgsConstructor
public class ClinicalRecordController {

    private final ClinicalBackgroundService backgrounds;
    private final ClinicalNoteService notes;
    private final OdontogramService odontogram;
    private final Icd10Service icd10;

    // ---------- CIE-10 ----------

    @GetMapping("/api/icd10")
    List<Diagnosis> searchIcd10(@RequestParam(required = false) String q) {
        return icd10.search(q);
    }

    // ---------- Antecedentes ----------

    @GetMapping("/api/patients/{patientId}/clinical-background")
    BackgroundResponse background(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID patientId) {
        return backgrounds.get(AuthUser.from(jwt).clinicId(), patientId);
    }

    @PutMapping("/api/patients/{patientId}/clinical-background")
    BackgroundResponse saveBackground(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID patientId,
                                      @Valid @RequestBody BackgroundRequest req) {
        return backgrounds.save(AuthUser.from(jwt), patientId, req);
    }

    // ---------- Evoluciones ----------

    @GetMapping("/api/patients/{patientId}/clinical-notes")
    List<NoteResponse> patientNotes(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID patientId) {
        return notes.byPatient(AuthUser.from(jwt).clinicId(), patientId);
    }

    @PostMapping("/api/patients/{patientId}/clinical-notes")
    @ResponseStatus(HttpStatus.CREATED)
    NoteResponse createNote(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID patientId,
                            @Valid @RequestBody NoteRequest req) {
        return notes.create(AuthUser.from(jwt), patientId, req);
    }

    /** ?scope=my-drafts → mis borradores; sin scope → últimas firmadas de la clínica. */
    @GetMapping("/api/clinical-notes")
    List<NoteSummary> listNotes(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) String scope) {
        return notes.list(AuthUser.from(jwt), "my-drafts".equals(scope));
    }

    @GetMapping("/api/clinical-notes/{id}")
    NoteResponse note(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return notes.get(AuthUser.from(jwt).clinicId(), id);
    }

    @PutMapping("/api/clinical-notes/{id}")
    NoteResponse updateNote(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                            @Valid @RequestBody NoteRequest req) {
        return notes.update(AuthUser.from(jwt), id, req);
    }

    @DeleteMapping("/api/clinical-notes/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteNote(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        notes.deleteDraft(AuthUser.from(jwt), id);
    }

    @PostMapping("/api/clinical-notes/{id}/sign")
    NoteResponse sign(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return notes.sign(AuthUser.from(jwt), id);
    }

    @PostMapping("/api/clinical-notes/{id}/addenda")
    @ResponseStatus(HttpStatus.CREATED)
    NoteResponse addAddendum(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                             @Valid @RequestBody AddendumRequest req) {
        return notes.addAddendum(AuthUser.from(jwt), id, req);
    }

    // ---------- Odontograma ----------

    /** Estado vigente; con ?at=… el odontograma tal como estaba en esa fecha. */
    @GetMapping("/api/patients/{patientId}/odontogram")
    List<OdontogramEntryResponse> odontogram(
            @AuthenticationPrincipal Jwt jwt, @PathVariable UUID patientId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime at) {
        return odontogram.state(AuthUser.from(jwt).clinicId(), patientId, at == null ? null : at.toInstant());
    }

    @GetMapping("/api/patients/{patientId}/odontogram/history")
    List<OdontogramEntryResponse> odontogramHistory(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID patientId) {
        return odontogram.history(AuthUser.from(jwt).clinicId(), patientId);
    }

    @PostMapping("/api/patients/{patientId}/odontogram")
    List<OdontogramEntryResponse> addOdontogramEntry(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID patientId,
                                                     @Valid @RequestBody OdontogramRequest req) {
        return odontogram.add(AuthUser.from(jwt), patientId, req);
    }

    @DeleteMapping("/api/patients/{patientId}/odontogram/{entryId}")
    List<OdontogramEntryResponse> removeOdontogramEntry(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID patientId,
                                                        @PathVariable UUID entryId) {
        return odontogram.remove(AuthUser.from(jwt), patientId, entryId);
    }
}
