package lat.occlus.platform;

import java.util.List;
import lat.occlus.platform.PlatformDtos.ClinicAnnouncement;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Avisos de Occlus para la clínica autenticada. Núcleo: no depende de ningún módulo. */
@RestController
@RequiredArgsConstructor
public class AnnouncementController {

    private final PlatformFeeds feeds;

    @GetMapping("/api/announcements")
    List<ClinicAnnouncement> announcements() {
        return feeds.visibleToClinic();
    }
}
