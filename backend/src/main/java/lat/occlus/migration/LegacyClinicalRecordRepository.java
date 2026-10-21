package lat.occlus.migration;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

interface LegacyClinicalRecordRepository extends JpaRepository<LegacyClinicalRecord, UUID> {

    List<LegacyClinicalRecord> findByClinicIdAndPatientIdAndVoidedAtIsNullOrderByAttendedAtDesc(
            UUID clinicId, UUID patientId, Limit limit);

    /** Huellas ya importadas de estos pacientes (para no duplicar al reimportar). */
    @Query("""
            select r.patientId, r.contentHash from LegacyClinicalRecord r
            where r.clinicId = :clinicId and r.patientId in :patientIds and r.voidedAt is null""")
    List<Object[]> existingHashes(UUID clinicId, Collection<UUID> patientIds);
}
