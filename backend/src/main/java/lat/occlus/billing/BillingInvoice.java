package lat.occlus.billing;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

@Entity @Getter @Setter @NoArgsConstructor
public class BillingInvoice {
    @Id @GeneratedValue(strategy=GenerationType.UUID) private UUID id;
    private UUID clinicId;
    private UUID patientId;
    private UUID planId;
    private long draftNumber;
    @Enumerated(EnumType.STRING) private BillingDtos.Status status = BillingDtos.Status.DRAFT;
    @Column(columnDefinition="text") private String snapshotJson;
    private BigDecimal total;
    private UUID createdBy;
    @CreationTimestamp private Instant createdAt;
    @UpdateTimestamp private Instant updatedAt;
    private Instant preparedAt;
    private UUID preparedBy;
    private Instant cancelledAt;
    private UUID cancelledBy;
    private String cancelReason;
    @Version private long version;
}
