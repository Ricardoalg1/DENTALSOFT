package lat.occlus.patient;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import java.text.Normalizer;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Period;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.envers.Audited;
import org.hibernate.envers.NotAudited;

/** Paciente de una clínica. @Audited: cada cambio queda guardado en patient_aud. */
@Entity
@Audited
@Getter
@Setter
@NoArgsConstructor
public class Patient {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private UUID clinicId;

    @Enumerated(EnumType.STRING)
    private DocumentType documentType;

    private String documentNumber;

    private String firstName;
    private String middleName;
    private String firstLastName;
    private String secondLastName;

    private LocalDate birthDate;

    @Enumerated(EnumType.STRING)
    private Sex sex;

    private String phone;
    private String email;
    private String address;
    private String municipality;

    @Enumerated(EnumType.STRING)
    private ResidenceZone residenceZone;

    @Enumerated(EnumType.STRING)
    private Regime regime;

    private String insurer;
    private String occupation;

    private String guardianName;
    private String guardianPhone;
    private String guardianRelationship;

    private String notes;

    private boolean active = true;

    /** Autorizó recibir recordatorios por WhatsApp (Ley 1581). */
    private boolean whatsappConsent;

    private Instant whatsappConsentAt;

    @NotAudited
    private String searchKey;

    @NotAudited
    @CreationTimestamp
    private Instant createdAt;

    @NotAudited
    @UpdateTimestamp
    private Instant updatedAt;

    public String fullName() {
        return Stream.of(firstName, middleName, firstLastName, secondLastName)
                .filter(Objects::nonNull)
                .collect(Collectors.joining(" "));
    }

    public int age(LocalDate today) {
        return Period.between(birthDate, today).getYears();
    }

    @PrePersist
    @PreUpdate
    void updateSearchKey() {
        searchKey = normalize(fullName() + " " + documentNumber);
    }

    /** "José Pérez" → "jose perez": minúsculas y sin tildes, para búsquedas tolerantes. */
    public static String normalize(String text) {
        return Normalizer.normalize(text, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT)
                .trim();
    }
}
