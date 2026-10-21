package lat.occlus.migration;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import lat.occlus.migration.MigrationDtos.BatchRequest;
import lat.occlus.migration.MigrationDtos.BatchResponse;
import lat.occlus.platform.AppModule;
import lat.occlus.platform.Entitlements;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.ConflictException;
import lat.occlus.shared.web.NotFoundException;
import lat.occlus.shared.web.Ref;
import lat.occlus.user.AppUser;
import lat.occlus.user.AppUserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Lotes de importación: se crea uno antes de enviar las partes del archivo y queda como registro. */
@Service
@RequiredArgsConstructor
public class MigrationBatches {

    private final MigrationBatchRepository batches;
    private final AppUserRepository users;
    private final Entitlements entitlements;

    @Transactional
    public BatchResponse create(AuthUser me, BatchRequest req) {
        // Pacientes es del núcleo; historia y documentos son parte del módulo de historia clínica.
        if (req.kind() != MigrationKind.PATIENTS) entitlements.require(me.clinicId(), AppModule.CLINICAL_RECORD);
        var batch = new MigrationBatch();
        batch.setClinicId(me.clinicId());
        batch.setKind(req.kind());
        batch.setSourceSystem(req.sourceSystem().strip());
        batch.setFileName(req.fileName() == null || req.fileName().isBlank() ? null : req.fileName().strip());
        batch.setCreatedBy(me.userId());
        return toResponses(List.of(batches.saveAndFlush(batch))).getFirst();
    }

    @Transactional(readOnly = true)
    public List<BatchResponse> list(UUID clinicId) {
        return toResponses(batches.findByClinicIdOrderByCreatedAtDesc(clinicId, Limit.of(100)));
    }

    @Transactional(readOnly = true)
    public BatchResponse get(UUID clinicId, UUID id) {
        return toResponses(List.of(find(clinicId, id))).getFirst();
    }

    /** El lote al que se suma una parte: de esta clínica, del tipo correcto y sin anular. */
    MigrationBatch requireOpen(UUID clinicId, UUID id, MigrationKind kind) {
        var batch = find(clinicId, id);
        if (batch.getKind() != kind) throw new BadRequestException("El lote no corresponde a este tipo de importación");
        if (batch.getVoidedAt() != null) throw new ConflictException("El lote fue anulado");
        return batch;
    }

    MigrationBatch find(UUID clinicId, UUID id) {
        return batches.findByIdAndClinicId(id, clinicId)
                .orElseThrow(() -> new NotFoundException("Lote de importación no encontrado"));
    }

    void addCounts(MigrationBatch batch, int created, int updated, int skipped, int errors) {
        batches.addCounts(batch.getId(), created, updated, skipped, errors);
    }

    private List<BatchResponse> toResponses(List<MigrationBatch> list) {
        Map<UUID, Ref> names = users.findAllById(list.stream().map(MigrationBatch::getCreatedBy).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(AppUser::getId, u -> new Ref(u.getId(), u.getFullName())));
        return list.stream().map(b -> new BatchResponse(b.getId(), b.getKind(), b.getSourceSystem(), b.getFileName(),
                names.get(b.getCreatedBy()), b.getCreatedAt(), b.getCreatedCount(), b.getUpdatedCount(),
                b.getSkippedCount(), b.getErrorCount(), b.getVoidedAt(), b.getVoidReason())).toList();
    }
}
