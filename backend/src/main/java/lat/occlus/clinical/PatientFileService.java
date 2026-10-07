package lat.occlus.clinical;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import lat.occlus.clinical.FileDtos.FileContent;
import lat.occlus.clinical.FileDtos.FileResponse;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.storage.FileStorage;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.ConflictException;
import lat.occlus.shared.web.ForbiddenException;
import lat.occlus.shared.web.NotFoundException;
import lat.occlus.user.Role;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
public class PatientFileService {

    private final PatientFileRepository files;
    private final FileStorage storage;
    private final ClinicalAccess access;

    @Transactional(readOnly = true)
    public List<FileResponse> list(UUID clinicId, UUID patientId) {
        access.requirePatient(clinicId, patientId);
        var list = files.findByClinicIdAndPatientIdAndCategoryNotAndRemovedAtIsNullOrderByCreatedAtDesc(
                clinicId, patientId, FileCategory.SIGNATURE);
        var users = access.userRefs(list.stream().map(PatientFile::getUploadedBy).toList());
        return list.stream().map(f -> new FileResponse(f.getId(), f.getCategory(), f.getTitle(), f.getOriginalFilename(),
                f.getContentType(), f.getSizeBytes(), f.getCreatedAt(), users.get(f.getUploadedBy()))).toList();
    }

    /** Sube radiografías, fotos o documentos (JPG, PNG, WEBP o PDF). */
    @Transactional
    public FileResponse upload(AuthUser me, UUID patientId, MultipartFile upload, FileCategory category, String title) {
        if (category == FileCategory.SIGNATURE) throw new BadRequestException("Categoría no válida");
        if (upload == null || upload.isEmpty()) throw new BadRequestException("Selecciona un archivo");
        byte[] content;
        try {
            content = upload.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        var type = FileType.detect(content)
                .orElseThrow(() -> new BadRequestException("Formato no permitido: usa JPG, PNG, WEBP o PDF"));
        String name = title == null || title.isBlank() ? baseName(upload.getOriginalFilename()) : title.trim();
        var saved = store(me, patientId, content, type, category, name, upload.getOriginalFilename());
        return new FileResponse(saved.getId(), saved.getCategory(), saved.getTitle(), saved.getOriginalFilename(),
                saved.getContentType(), saved.getSizeBytes(), saved.getCreatedAt(),
                access.userRefs(List.of(me.userId())).get(me.userId()));
    }

    /** Guarda el contenido en S3 y registra los metadatos. Lo usan también los consentimientos (firmas). */
    PatientFile store(AuthUser me, UUID patientId, byte[] content, FileType type, FileCategory category,
                      String title, String originalFilename) {
        access.requirePatient(me.clinicId(), patientId);
        UUID id = UUID.randomUUID();
        String key = "clinics/%s/patients/%s/%s.%s".formatted(me.clinicId(), patientId, id, type.extension);
        storage.put(key, content, type.contentType);
        try {
            var f = new PatientFile();
            f.setClinicId(me.clinicId());
            f.setPatientId(patientId);
            f.setCategory(category);
            f.setTitle(truncate(title, 150));
            f.setOriginalFilename(originalFilename == null ? null : truncate(originalFilename, 255));
            f.setContentType(type.contentType);
            f.setSizeBytes(content.length);
            f.setSha256(sha256(content));
            f.setStorageKey(key);
            f.setUploadedBy(me.userId());
            return files.saveAndFlush(f);
        } catch (RuntimeException e) {
            storage.deleteQuietly(key);
            throw e;
        }
    }

    @Transactional(readOnly = true)
    public FileContent open(UUID clinicId, UUID id) {
        var f = find(clinicId, id);
        return new FileContent(f, storage.get(f.getStorageKey()));
    }

    /** Oculta un archivo (sigue guardado). Solo quien lo subió o un administrador. */
    @Transactional
    public void remove(AuthUser me, UUID id, String reason) {
        var f = find(me.clinicId(), id);
        if (f.getCategory() == FileCategory.SIGNATURE) throw new ConflictException("Las firmas no se pueden quitar");
        if (f.getRemovedAt() != null) throw new ConflictException("El archivo ya fue quitado");
        if (!f.getUploadedBy().equals(me.userId()) && me.role() != Role.ADMIN) {
            throw new ForbiddenException("Solo quien subió el archivo o un administrador puede quitarlo");
        }
        f.setRemovedAt(Instant.now());
        f.setRemovedBy(me.userId());
        f.setRemovalReason(reason.trim());
    }

    PatientFile find(UUID clinicId, UUID id) {
        return files.findByIdAndClinicId(id, clinicId).orElseThrow(() -> new NotFoundException("Archivo no encontrado"));
    }

    static String sha256(byte[] content) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String baseName(String filename) {
        if (filename == null || filename.isBlank()) return "Archivo";
        int dot = filename.lastIndexOf('.');
        return dot > 0 ? filename.substring(0, dot) : filename;
    }

    private static String truncate(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max);
    }
}
