package lat.occlus.clinical;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import lat.occlus.clinical.ClinicalDtos.Ref;
import lat.occlus.patient.Patient;
import lat.occlus.patient.PatientRepository;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.ForbiddenException;
import lat.occlus.shared.web.NotFoundException;
import lat.occlus.user.AppUser;
import lat.occlus.user.AppUserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Reglas de acceso a la historia clínica (reservada al equipo de salud, Res. 1995 de 1999):
 * <ul>
 *   <li>Leer: administrador, odontólogo y auxiliar. Recepción no (lo impone @PreAuthorize en los controladores).</li>
 *   <li>Escribir: solo usuarios activos marcados como profesionales.</li>
 * </ul>
 */
@Component
@RequiredArgsConstructor
class ClinicalAccess {

    /** Expresión para @PreAuthorize de los controladores clínicos. */
    static final String CAN_READ = "hasAnyRole('ADMIN', 'DENTIST', 'ASSISTANT')";

    private final AppUserRepository users;
    private final PatientRepository patients;

    AppUser requireProfessional(AuthUser me) {
        return users.findByIdAndClinicId(me.userId(), me.clinicId())
                .filter(u -> u.isActive() && u.isProfessional())
                .orElseThrow(() -> new ForbiddenException("Solo los profesionales pueden escribir en la historia clínica"));
    }

    Patient requirePatient(UUID clinicId, UUID patientId) {
        return patients.findByIdAndClinicId(patientId, clinicId)
                .orElseThrow(() -> new NotFoundException("Paciente no encontrado"));
    }

    /** Nombres de usuarios en una sola consulta (para "creado por", "firmado por"…). */
    Map<UUID, Ref> userRefs(Collection<UUID> ids) {
        return users.findAllById(ids.stream().filter(java.util.Objects::nonNull).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(AppUser::getId, u -> new Ref(u.getId(), u.getFullName())));
    }
}
