package lat.occlus.marketing;

import lat.occlus.shared.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.stereotype.Component;

@Component
@EnableScheduling
@RequiredArgsConstructor
public class MarketingRetention {
    private final MarketingProperties config;
    private final MarketingStore store;

    @Scheduled(cron = "0 20 3 * * *", zone = "America/Bogota")
    public void purge() {
        // Nunca borra datos hasta que el responsable active un plazo explícito.
        if (!config.retentionEnabled()) return;
        if (config.retentionDays() < 1 || config.retentionDays() > 3650)
            throw new IllegalStateException("Configura un plazo de conservación entre 1 y 3650 días.");
        TenantContext.callAsSystem(() -> { store.purgeExpired(config.retentionDays()); return null; });
    }
}
