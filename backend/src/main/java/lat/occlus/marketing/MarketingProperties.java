package lat.occlus.marketing;

import java.util.Set;
import java.util.UUID;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("occlus.marketing")
public record MarketingProperties(String publicKey,Set<UUID> adminUserIds,boolean analyticsEnabled,boolean retentionEnabled,int retentionDays) {
 @Override public String toString(){return "MarketingProperties[publicKey=REDACTED]";}
}
