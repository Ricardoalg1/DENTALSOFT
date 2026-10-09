package lat.occlus.clinical;

import lat.occlus.platform.AppModule;
import lat.occlus.platform.RequiresModule;

import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lat.occlus.clinical.ConsentDtos.ConsentRequest;
import lat.occlus.clinical.ConsentDtos.ConsentResponse;
import lat.occlus.clinical.ConsentDtos.RevokeRequest;
import lat.occlus.clinical.ConsentDtos.TemplateRequest;
import lat.occlus.clinical.ConsentDtos.TemplateResponse;
import lat.occlus.shared.security.AuthUser;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Consentimientos informados y sus plantillas. Las plantillas las administra solo el administrador. */
@RequiresModule(AppModule.CLINICAL_RECORD)
@RestController
@PreAuthorize(ClinicalAccess.CAN_READ)
@RequiredArgsConstructor
public class ConsentController {

    private final ConsentService service;

    @GetMapping("/api/consent-templates")
    List<TemplateResponse> templates(@AuthenticationPrincipal Jwt jwt,
                                     @RequestParam(defaultValue = "false") boolean includeInactive) {
        return service.templates(AuthUser.from(jwt).clinicId(), includeInactive);
    }

    @PostMapping("/api/consent-templates")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    TemplateResponse createTemplate(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody TemplateRequest req) {
        return service.saveTemplate(AuthUser.from(jwt).clinicId(), null, req);
    }

    @PutMapping("/api/consent-templates/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    TemplateResponse updateTemplate(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                                    @Valid @RequestBody TemplateRequest req) {
        return service.saveTemplate(AuthUser.from(jwt).clinicId(), id, req);
    }

    @PostMapping("/api/consent-templates/examples")
    @PreAuthorize("hasRole('ADMIN')")
    List<TemplateResponse> loadExamples(@AuthenticationPrincipal Jwt jwt) {
        return service.loadExamples(AuthUser.from(jwt).clinicId());
    }

    @GetMapping("/api/patients/{patientId}/consents")
    List<ConsentResponse> byPatient(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID patientId) {
        return service.byPatient(AuthUser.from(jwt).clinicId(), patientId);
    }

    @PostMapping("/api/patients/{patientId}/consents")
    @ResponseStatus(HttpStatus.CREATED)
    ConsentResponse sign(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID patientId,
                         @Valid @RequestBody ConsentRequest req) {
        return service.sign(AuthUser.from(jwt), patientId, req);
    }

    @GetMapping("/api/consents/{id}")
    ConsentResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return service.get(AuthUser.from(jwt).clinicId(), id);
    }

    @PostMapping("/api/consents/{id}/revoke")
    ConsentResponse revoke(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody RevokeRequest req) {
        return service.revoke(AuthUser.from(jwt), id, req.reason());
    }
}
