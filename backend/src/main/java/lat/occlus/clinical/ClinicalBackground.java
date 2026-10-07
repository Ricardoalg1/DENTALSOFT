package lat.occlus.clinical;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.envers.Audited;
import org.hibernate.envers.NotAudited;
import org.hibernate.type.SqlTypes;

/** Antecedentes (anamnesis) del paciente. Uno por paciente; cada versión queda en clinical_background_aud. */
@Entity
@Audited
@Getter
@Setter
@NoArgsConstructor
public class ClinicalBackground {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private UUID clinicId;
    private UUID patientId;

    /** Nombres de {@link MedicalCondition}, guardados como arreglo de Postgres (varchar[]). */
    @JdbcTypeCode(SqlTypes.ARRAY)
    private List<String> conditions = new ArrayList<>();

    /** Nombres de {@link Habit}. */
    @JdbcTypeCode(SqlTypes.ARRAY)
    private List<String> habits = new ArrayList<>();

    private String allergies;
    private String medications;
    private String surgicalHistory;
    private String familyHistory;
    private String observations;

    private UUID updatedBy;

    @NotAudited
    @CreationTimestamp
    private Instant createdAt;

    @NotAudited
    @UpdateTimestamp
    private Instant updatedAt;
}
