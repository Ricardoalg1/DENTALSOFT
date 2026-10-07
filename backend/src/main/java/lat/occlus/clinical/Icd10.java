package lat.occlus.clinical;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** Diagnóstico CIE-10. Catálogo de solo lectura cargado por Flyway. */
@Entity
@Getter
@NoArgsConstructor
public class Icd10 {

    /** Sin punto, como en RIPS: "K021". */
    @Id
    private String code;

    private String description;

    /** Columna generada por Postgres; Hibernate nunca la escribe. */
    @Column(insertable = false, updatable = false)
    private String searchKey;

    /** "K021" → "K02.1", como se acostumbra a mostrar. */
    public static String display(String code) {
        return code.length() == 4 ? code.substring(0, 3) + "." + code.substring(3) : code;
    }
}
