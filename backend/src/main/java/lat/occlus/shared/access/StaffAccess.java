package lat.occlus.shared.access;

import java.util.Collection;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import lat.occlus.patient.Patient;
import lat.occlus.patient.PatientRepository;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.ForbiddenException;
import lat.occlus.shared.web.NotFoundException;
import lat.occlus.shared.web.Ref;
import lat.occlus.user.AppUser;
import lat.occlus.user.AppUserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** Comprobaciones comunes de los módulos administrativos (tratamientos, caja). */
@Component
@RequiredArgsConstructor
public class StaffAccess {

    private final AppUserRepository users;
    private final PatientRepository patients;

    /** Usuario activo que atiende pacientes (odontólogo, o administrador marcado como profesional). */
    public AppUser requireProfessional(AuthUser me) {
        return users.findByIdAndClinicId(me.userId(), me.clinicId())
                .filter(u -> u.isActive() && u.isProfessional())
                .orElseThrow(() -> new ForbiddenException("Solo los profesionales pueden hacer esta acción"));
    }

    public Patient requirePatient(UUID clinicId, UUID patientId) {
        return patients.findByIdAndClinicId(patientId, clinicId)
                .orElseThrow(() -> new NotFoundException("Paciente no encontrado"));
    }

    /** Nombres de usuarios en una sola consulta. */
    public Map<UUID, Ref> userRefs(Collection<UUID> ids) {
        return users.findAllById(ids.stream().filter(Objects::nonNull).collect(Collectors.toSet())).stream()
                .collect(Collectors.toMap(AppUser::getId, u -> new Ref(u.getId(), u.getFullName())));
    }
}
