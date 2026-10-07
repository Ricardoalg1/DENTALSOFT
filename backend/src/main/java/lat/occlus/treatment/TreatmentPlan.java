package lat.occlus.treatment;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.envers.Audited;
import org.hibernate.envers.NotAudited;

@Entity
@Audited
@Getter
@Setter
@NoArgsConstructor
public class TreatmentPlan {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private UUID clinicId;
    private UUID patientId;
    private UUID dentistId;
    private String title;

    @Enumerated(EnumType.STRING)
    private PlanStatus status = PlanStatus.DRAFT;

    private String notes;
    private LocalDate validUntil;
    private Instant acceptedAt;
    private UUID acceptedBy;
    private Instant closedAt;

    @NotAudited
    @CreationTimestamp
    private Instant createdAt;

    @NotAudited
    @UpdateTimestamp
    private Instant updatedAt;
}
