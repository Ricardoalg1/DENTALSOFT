package lat.occlus.site;

import jakarta.validation.Valid;
import java.util.List;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.site.SiteDtos.SiteRequest;
import lat.occlus.site.SiteDtos.SiteResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/sites")
@RequiredArgsConstructor
public class SiteController {

    private final SiteService service;

    @GetMapping
    List<SiteResponse> list(@AuthenticationPrincipal Jwt jwt) {
        return service.list(AuthUser.from(jwt).clinicId());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('ADMIN')")
    SiteResponse create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody SiteRequest req) {
        return service.create(AuthUser.from(jwt).clinicId(), req);
    }
}
