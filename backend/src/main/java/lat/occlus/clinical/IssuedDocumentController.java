package lat.occlus.clinical;

import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lat.occlus.platform.AppModule;
import lat.occlus.platform.RequiresModule;
import lat.occlus.shared.security.AuthUser;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequiresModule(AppModule.CLINICAL_RECORD)
@PreAuthorize(ClinicalAccess.CAN_READ)
public class IssuedDocumentController {

    private final IssuedDocumentService service;

    @GetMapping("/api/patients/{patient}/issued-documents")
    List<IssuedDocumentService.Summary> list(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID patient) {
        return service.list(AuthUser.from(jwt), patient);
    }

    @PostMapping("/api/patients/{patient}/issued-documents")
    @ResponseStatus(HttpStatus.CREATED)
    IssuedDocumentService.Response issue(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID patient,
                                         @Valid @RequestBody IssuedDocumentService.Request req) {
        return service.issue(AuthUser.from(jwt), patient, req);
    }

    @GetMapping("/api/issued-documents/{id}")
    IssuedDocumentService.Response get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return service.get(AuthUser.from(jwt), id);
    }
}
