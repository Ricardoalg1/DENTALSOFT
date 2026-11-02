package lat.occlus.site;

import java.util.List;
import java.util.UUID;
import lat.occlus.site.SiteDtos.SiteRequest;
import lat.occlus.site.SiteDtos.SiteResponse;
import lat.occlus.shared.web.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class SiteService {

    private final SiteRepository sites;

    @Transactional(readOnly = true)
    public List<SiteResponse> list(UUID clinicId) {
        return sites.findByClinicIdOrderByName(clinicId).stream().map(SiteResponse::from).toList();
    }

    @Transactional
    public SiteResponse create(UUID clinicId, SiteRequest req) {
        var site = new Site();
        site.setClinicId(clinicId);
        site.setName(req.name());
        site.setAddress(req.address());
        site.setCity(req.city());
        site.setPhone(req.phone());
        return SiteResponse.from(sites.save(site));
    }

    @Transactional
    public SiteResponse update(UUID clinicId, UUID id, SiteRequest req) {
        var site = sites.findById(id).filter(s -> s.getClinicId().equals(clinicId))
                .orElseThrow(() -> new NotFoundException("Sede no encontrada"));
        site.setName(req.name().strip());
        site.setAddress(clean(req.address()));
        site.setCity(clean(req.city()));
        site.setPhone(clean(req.phone()));
        return SiteResponse.from(sites.save(site));
    }

    private static String clean(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
