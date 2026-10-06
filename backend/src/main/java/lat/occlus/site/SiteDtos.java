package lat.occlus.site;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public final class SiteDtos {

    private SiteDtos() {}

    public record SiteRequest(
            @NotBlank @Size(max = 120) String name,
            @Size(max = 200) String address,
            @Size(max = 80) String city,
            @Size(max = 30) String phone) {}

    public record SiteResponse(UUID id, String name, String address, String city, String phone, boolean active) {
        static SiteResponse from(Site s) {
            return new SiteResponse(s.getId(), s.getName(), s.getAddress(), s.getCity(), s.getPhone(), s.isActive());
        }
    }
}
