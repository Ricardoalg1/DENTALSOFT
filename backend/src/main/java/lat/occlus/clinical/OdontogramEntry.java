package lat.occlus.clinical;

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

/**
 * Una marca del odontograma (p. ej. caries en la oclusal del 36). No se borra: al quitarla se llena
 * {@code removedAt}, así el odontograma de cualquier fecha se puede reconstruir.
 */
@Entity
@Getter
@Setter
@NoArgsConstructor
public class OdontogramEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private UUID clinicId;
    private UUID patientId;

    /** Notación FDI: 11–48 permanentes, 51–85 temporales. */
    private short tooth;

    /** null = la marca aplica al diente completo. */
    @Enumerated(EnumType.STRING)
    private ToothSurface surface;

    @Enumerated(EnumType.STRING)
    private OdontogramCondition condition;

    private String note;

    private UUID createdBy;

    @CreationTimestamp
    private Instant createdAt;

    private Instant removedAt;
    private UUID removedBy;

    public boolean isActive() {
        return removedAt == null;
    }

    /** ¿El número es un diente válido en notación FDI? */
    public static boolean isValidTooth(int tooth) {
        int quadrant = tooth / 10;
        int position = tooth % 10;
        return (quadrant >= 1 && quadrant <= 4 && position >= 1 && position <= 8)
                || (quadrant >= 5 && quadrant <= 8 && position >= 1 && position <= 5);
    }
}
