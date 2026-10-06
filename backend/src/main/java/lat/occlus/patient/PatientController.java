package lat.occlus.patient;

import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lat.occlus.patient.PatientDtos.PatientRequest;
import lat.occlus.patient.PatientDtos.PatientResponse;
import lat.occlus.patient.PatientDtos.PatientRevision;
import lat.occlus.patient.PatientDtos.PatientSummary;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.PageResponse;
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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/patients")
@RequiredArgsConstructor
public class PatientController {

    private final PatientService service;

    @GetMapping
    PageResponse<PatientSummary> search(@AuthenticationPrincipal Jwt jwt,
                                        @RequestParam(required = false) String q,
                                        @RequestParam(defaultValue = "0") int page,
                                        @RequestParam(defaultValue = "20") int size) {
        return service.search(AuthUser.from(jwt).clinicId(), q, page, size);
    }

    @GetMapping("/{id}")
    PatientResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return service.get(AuthUser.from(jwt).clinicId(), id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    PatientResponse create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody PatientRequest req) {
        return service.create(AuthUser.from(jwt).clinicId(), req);
    }

    @PutMapping("/{id}")
    PatientResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                           @Valid @RequestBody PatientRequest req) {
        return service.update(AuthUser.from(jwt).clinicId(), id, req);
    }

    /** Historial de cambios (auditoría). Solo administradores. */
    @GetMapping("/{id}/history")
    @PreAuthorize("hasRole('ADMIN')")
    List<PatientRevision> history(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return service.history(AuthUser.from(jwt).clinicId(), id);
    }
}
