package lat.occlus.migration;

import jakarta.persistence.Column;
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
 * Un lote de importación: un archivo (o una carpeta de documentos) traído de otro programa.
 * El navegador lo envía en partes; cada parte suma a los contadores.
 */
@Entity
@Getter
@Setter
@NoArgsConstructor
public class MigrationBatch {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private UUID clinicId;

    @Enumerated(EnumType.STRING)
    private MigrationKind kind;

    /** Programa de origen ("Dentalink", "Excel propio"…), tal como lo escribe la clínica. */
    private String sourceSystem;
    private String fileName;

    private UUID createdBy;

    @CreationTimestamp
    private Instant createdAt;

    // Los contadores se actualizan con una consulta UPDATE (ver el repositorio), no desde la entidad.
    @Column(insertable = false, updatable = false)
    private int createdCount;
    @Column(insertable = false, updatable = false)
    private int updatedCount;
    @Column(insertable = false, updatable = false)
    private int skippedCount;
    @Column(insertable = false, updatable = false)
    private int errorCount;

    private Instant voidedAt;
    private UUID voidedBy;
    private String voidReason;
}
