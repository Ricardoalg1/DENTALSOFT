package lat.occlus.appointment;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import java.time.Instant;
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
public class Appointment {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private UUID clinicId;
    private UUID siteId;
    private UUID dentistId;
    private UUID patientId;

    private Instant startsAt;
    private Instant endsAt;

    @Enumerated(EnumType.STRING)
    private AppointmentStatus status = AppointmentStatus.SCHEDULED;

    private String reason;
    private String notes;
    private String cancellationReason;

    @NotAudited
    private UUID createdBy;

    @NotAudited
    @CreationTimestamp
    private Instant createdAt;

    @NotAudited
    @UpdateTimestamp
    private Instant updatedAt;
}
