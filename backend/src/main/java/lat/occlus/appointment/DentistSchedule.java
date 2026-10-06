package lat.occlus.appointment;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import java.time.LocalTime;
import java.util.UUID;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Bloque del horario semanal de un profesional en una sede (p. ej. lunes 08:00–12:00 en Sede Norte). */
@Entity
@Getter
@Setter
@NoArgsConstructor
public class DentistSchedule {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private UUID clinicId;
    private UUID dentistId;
    private UUID siteId;

    /** 1 = lunes … 7 = domingo (ISO-8601, igual que {@link java.time.DayOfWeek#getValue()}). */
    private short dayOfWeek;

    private LocalTime startTime;
    private LocalTime endTime;
}
