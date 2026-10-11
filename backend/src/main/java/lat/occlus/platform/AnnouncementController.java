package lat.occlus.platform;

import java.util.List;
import java.util.UUID;
import lat.occlus.platform.PlatformDtos.ClinicAnnouncement;
import lat.occlus.shared.security.AuthUser;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Avisos de Occlus para la clínica autenticada (campanita). Núcleo: no depende de ningún módulo. */
@RestController
@RequiredArgsConstructor
public class AnnouncementController {

    private final PlatformFeeds feeds;

    @GetMapping("/api/announcements")
    List<ClinicAnnouncement> announcements(@AuthenticationPrincipal Jwt jwt) {
        return feeds.visibleToClinic(AuthUser.from(jwt));
    }

    @PostMapping("/api/announcements/{id}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void markRead(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        feeds.markAnnouncementRead(AuthUser.from(jwt), id);
    }

    @PostMapping("/api/announcements/read-all")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void markAllRead(@AuthenticationPrincipal Jwt jwt) {
        feeds.markAllAnnouncementsRead(AuthUser.from(jwt));
    }
}
