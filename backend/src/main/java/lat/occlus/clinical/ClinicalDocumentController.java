package lat.occlus.clinical;
import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import lat.occlus.platform.*;
import lat.occlus.shared.security.AuthUser;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
@RequiresModule(AppModule.CLINICAL_RECORD)
@RestController @PreAuthorize(ClinicalAccess.CAN_READ) @RequiredArgsConstructor
public class ClinicalDocumentController {
    private final ClinicalDocumentService documents;
    private final ClinicalDocumentAudit audit;
    private final ClinicalMailService mail;
    @GetMapping("/api/clinical-export/status")
    Map<String,Boolean> status() { return Map.of("emailEnabled",mail.available()); }
    @GetMapping("/api/patients/{id}/clinical-document.pdf")
    ResponseEntity<byte[]> pdf(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestParam(required=false) UUID noteId,
                              @RequestParam(defaultValue="false") boolean print) {
        var actor=AuthUser.from(jwt); var data=documents.document(actor,id,noteId); var content=documents.pdf(data);
        audit.record(actor,id,UUID.randomUUID(),print?"PRINT":"PDF","GENERATED");
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF).cacheControl(CacheControl.noStore())
            .header("Content-Disposition","inline; filename=historia-clinica.pdf").body(content);
    }
    @GetMapping("/api/patients/{id}/clinical-document.json")
    ResponseEntity<ClinicalDocumentService.Document> json(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestParam(required=false) UUID noteId) {
        var actor=AuthUser.from(jwt); var data=documents.document(actor,id,noteId);
        audit.record(actor,id,UUID.randomUUID(),"JSON","GENERATED");
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Content-Disposition","attachment; filename=historia-clinica.json").body(data);
    }
    public record SendRequest(@NotNull UUID operationId, boolean confirmed) {}
    @PostMapping("/api/patients/{id}/clinical-document/email")
    Map<String,String> email(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@Valid @RequestBody SendRequest req) {
        mail.send(AuthUser.from(jwt),id,req.operationId(),req.confirmed()); return Map.of("status","ACCEPTED");
    }
}
