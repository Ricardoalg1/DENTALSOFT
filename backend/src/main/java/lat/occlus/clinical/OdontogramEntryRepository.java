package lat.occlus.clinical;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface OdontogramEntryRepository extends JpaRepository<OdontogramEntry, UUID> {

    Optional<OdontogramEntry> findByIdAndClinicIdAndPatientId(UUID id, UUID clinicId, UUID patientId);

    List<OdontogramEntry> findByClinicIdAndPatientIdAndToothAndRemovedAtIsNull(UUID clinicId, UUID patientId, short tooth);

    /** Marcas vigentes en el instante {@code at}: creadas antes y no quitadas todavía. */
    @Query("""
            select e from OdontogramEntry e
            where e.clinicId = :clinicId and e.patientId = :patientId
              and e.createdAt <= :at
              and (e.removedAt is null or e.removedAt > :at)
            order by e.tooth, e.createdAt""")
    List<OdontogramEntry> findActiveAt(UUID clinicId, UUID patientId, Instant at);

    List<OdontogramEntry> findByClinicIdAndPatientIdOrderByCreatedAtDesc(UUID clinicId, UUID patientId, Limit limit);
}
