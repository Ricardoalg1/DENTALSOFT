package lat.occlus.shared.audit;

import java.util.UUID;
import lat.occlus.shared.tenant.TenantContext;
import org.hibernate.envers.RevisionListener;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/** Completa cada revisión con la clínica y el usuario que hicieron el cambio. */
public class AuditRevisionListener implements RevisionListener {

    @Override
    public void newRevision(Object revisionEntity) {
        var revision = (AuditRevision) revisionEntity;
        revision.setClinicId(TenantContext.clinicId().orElse(null));
        if (SecurityContextHolder.getContext().getAuthentication() instanceof JwtAuthenticationToken token) {
            revision.setUserId(UUID.fromString(token.getToken().getSubject()));
        }
    }
}
