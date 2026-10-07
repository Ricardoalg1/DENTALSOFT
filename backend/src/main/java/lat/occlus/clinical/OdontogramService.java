package lat.occlus.clinical;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import lat.occlus.clinical.ClinicalDtos.OdontogramEntryResponse;
import lat.occlus.clinical.ClinicalDtos.OdontogramRequest;
import lat.occlus.clinical.ClinicalDtos.Ref;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.ConflictException;
import lat.occlus.shared.web.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class OdontogramService {

    private final OdontogramEntryRepository entries;
    private final ClinicalAccess access;

    /** Odontograma vigente en {@code at} (null = ahora). */
    @Transactional(readOnly = true)
    public List<OdontogramEntryResponse> state(UUID clinicId, UUID patientId, Instant at) {
        access.requirePatient(clinicId, patientId);
        return toResponses(entries.findActiveAt(clinicId, patientId, at == null ? Instant.now() : at));
    }

    /** Todas las marcas, incluidas las quitadas, de la más reciente a la más antigua. */
    @Transactional(readOnly = true)
    public List<OdontogramEntryResponse> history(UUID clinicId, UUID patientId) {
        access.requirePatient(clinicId, patientId);
        return toResponses(entries.findByClinicIdAndPatientIdOrderByCreatedAtDesc(clinicId, patientId, Limit.of(500)));
    }

    /**
     * Registra una marca aplicando las reglas del odontograma:
     * <ul>
     *   <li>Una superficie tiene un solo estado: la marca nueva reemplaza a la anterior.</li>
     *   <li>Ausente / implante / sin erupcionar reemplazan todo lo del diente, y mientras estén
     *       no se le pueden poner otras marcas.</li>
     *   <li>Repetir una marca que ya está vigente no hace nada (devuelve el estado actual).</li>
     * </ul>
     * Devuelve el estado vigente del diente.
     */
    @Transactional
    public List<OdontogramEntryResponse> add(AuthUser me, UUID patientId, OdontogramRequest req) {
        access.requireProfessional(me);
        access.requirePatient(me.clinicId(), patientId);
        if (!OdontogramEntry.isValidTooth(req.tooth())) {
            throw new BadRequestException("El diente %d no existe en la notación FDI".formatted(req.tooth()));
        }
        var condition = req.condition();
        if (condition.isSurface() && req.surface() == null) {
            throw new BadRequestException("Esta marca se registra en una superficie del diente");
        }
        if (!condition.isSurface() && req.surface() != null) {
            throw new BadRequestException("Esta marca aplica al diente completo, sin superficie");
        }

        short tooth = req.tooth().shortValue();
        var current = entries.findByClinicIdAndPatientIdAndToothAndRemovedAtIsNull(me.clinicId(), patientId, tooth);
        boolean alreadyThere = current.stream()
                .anyMatch(e -> e.getCondition() == condition && e.getSurface() == req.surface());
        if (alreadyThere) return toothState(me.clinicId(), patientId, tooth);

        var exclusive = current.stream().filter(e -> e.getCondition().isExclusive()).findFirst();
        Instant now = Instant.now();
        Stream<OdontogramEntry> toRemove;
        if (condition.isExclusive()) {
            toRemove = current.stream();
        } else if (exclusive.isPresent()) {
            throw new ConflictException("El diente %d está marcado como %s: quita esa marca primero"
                    .formatted(tooth, label(exclusive.get().getCondition())));
        } else if (condition.isSurface()) {
            toRemove = current.stream().filter(e -> e.getSurface() == req.surface());
        } else {
            toRemove = current.stream().filter(e -> condition.replaces().contains(e.getCondition()));
        }
        toRemove.forEach(e -> markRemoved(e, me.userId(), now));
        // Los "quitados" deben llegar a la BD antes del insert para no chocar con los índices únicos.
        entries.flush();

        var entry = new OdontogramEntry();
        entry.setClinicId(me.clinicId());
        entry.setPatientId(patientId);
        entry.setTooth(tooth);
        entry.setSurface(req.surface());
        entry.setCondition(condition);
        entry.setNote(req.note() == null || req.note().isBlank() ? null : req.note().trim());
        entry.setCreatedBy(me.userId());
        entries.saveAndFlush(entry);
        return toothState(me.clinicId(), patientId, tooth);
    }

    /** Quita una marca vigente (queda en el historial). Devuelve el estado vigente del diente. */
    @Transactional
    public List<OdontogramEntryResponse> remove(AuthUser me, UUID patientId, UUID entryId) {
        access.requireProfessional(me);
        var entry = entries.findByIdAndClinicIdAndPatientId(entryId, me.clinicId(), patientId)
                .orElseThrow(() -> new NotFoundException("Marca no encontrada"));
        if (!entry.isActive()) throw new ConflictException("Esa marca ya fue quitada");
        markRemoved(entry, me.userId(), Instant.now());
        entries.flush();
        return toothState(me.clinicId(), patientId, entry.getTooth());
    }

    private List<OdontogramEntryResponse> toothState(UUID clinicId, UUID patientId, short tooth) {
        return toResponses(entries.findByClinicIdAndPatientIdAndToothAndRemovedAtIsNull(clinicId, patientId, tooth));
    }

    private static void markRemoved(OdontogramEntry e, UUID userId, Instant at) {
        e.setRemovedAt(at);
        e.setRemovedBy(userId);
    }

    private List<OdontogramEntryResponse> toResponses(List<OdontogramEntry> list) {
        Map<UUID, Ref> users = access.userRefs(list.stream()
                .flatMap(e -> Stream.of(e.getCreatedBy(), e.getRemovedBy())).toList());
        return list.stream().map(e -> new OdontogramEntryResponse(e.getId(), e.getTooth(), e.getSurface(),
                e.getCondition(), e.getNote(), e.getCreatedAt(), users.get(e.getCreatedBy()),
                e.getRemovedAt(), users.get(e.getRemovedBy()))).toList();
    }

    private static String label(OdontogramCondition c) {
        return switch (c) {
            case MISSING -> "ausente";
            case IMPLANT -> "implante";
            case UNERUPTED -> "sin erupcionar";
            default -> c.name();
        };
    }
}
