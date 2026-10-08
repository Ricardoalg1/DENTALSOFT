package lat.occlus.billing;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity @Getter @Setter @NoArgsConstructor
public class BillingProfile {
    @Id private UUID clinicId;
    private String legalName;
    private String nit;
    private String providerCode;
    private String address;
    private String municipality;
    private String email;
    private UUID updatedBy;
    private Instant updatedAt;

    public BillingDtos.Issuer issuer() {
        return new BillingDtos.Issuer(legalName,nit,providerCode,address,municipality,email);
    }
}
