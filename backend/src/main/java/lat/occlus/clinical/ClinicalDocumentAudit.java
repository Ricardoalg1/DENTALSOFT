package lat.occlus.clinical;
import java.util.UUID;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.ConflictException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
@Service @RequiredArgsConstructor
public class ClinicalDocumentAudit {
    private final JdbcTemplate db;
    @Transactional(propagation=Propagation.REQUIRES_NEW)
    public void record(AuthUser actor, UUID patient, UUID operation, String kind, String status) {
        if (kind.equals("EMAIL") && status.equals("ATTEMPTED")) {
            db.queryForList("select pg_advisory_xact_lock(hashtextextended(?,0))",actor.clinicId()+":"+patient);
            if(Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from clinical_document_event where clinic_id=? and patient_id=? and kind='EMAIL' and status='ATTEMPTED' and created_at>now()-interval '1 minute')",Boolean.class,actor.clinicId(),patient)))
                throw new ConflictException("Ya hay un envío reciente. Revisa el resultado antes de repetirlo.");
            if(Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from clinical_document_event where clinic_id=? and operation_id=? and kind='EMAIL' and status='ATTEMPTED')",Boolean.class,actor.clinicId(),operation)))
                throw new ConflictException("Este envío ya fue intentado. No se reenviará automáticamente.");
        }
        db.update("insert into clinical_document_event(id,clinic_id,patient_id,actor_id,operation_id,kind,status) values(?,?,?,?,?,?,?)",UUID.randomUUID(),actor.clinicId(),patient,actor.userId(),operation,kind,status);
    }
}
