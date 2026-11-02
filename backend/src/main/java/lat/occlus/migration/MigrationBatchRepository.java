package lat.occlus.migration;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

interface MigrationBatchRepository extends JpaRepository<MigrationBatch, UUID> {

    Optional<MigrationBatch> findByIdAndClinicId(UUID id, UUID clinicId);

    List<MigrationBatch> findByClinicIdOrderByCreatedAtDesc(UUID clinicId, Limit limit);

    /** Suma en la BD (y no en memoria) para que dos partes enviadas a la vez no se pisen. */
    @Modifying
    @Query("""
            update MigrationBatch b set b.createdCount = b.createdCount + :created,
                b.updatedCount = b.updatedCount + :updated, b.skippedCount = b.skippedCount + :skipped,
                b.errorCount = b.errorCount + :errors
            where b.id = :id""")
    void addCounts(UUID id, int created, int updated, int skipped, int errors);
}
