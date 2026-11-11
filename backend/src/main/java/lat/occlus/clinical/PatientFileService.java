package lat.occlus.clinical;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
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
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
public class PatientFileService {

    private final PatientFileRepository files;
    private final FileStorage storage;
    private final ClinicalAccess access;
    private final TransactionTemplate tx;

    @Transactional(readOnly = true)
    public List<FileResponse> list(UUID clinicId, UUID patientId) {
        access.requirePatient(clinicId, patientId);
        var list = files.findByClinicIdAndPatientIdAndCategoryNotAndRemovedAtIsNullOrderByCreatedAtDesc(
                clinicId, patientId, FileCategory.SIGNATURE);
        var users = access.userRefs(list.stream().map(PatientFile::getUploadedBy).toList());
        return list.stream().map(f -> new FileResponse(f.getId(), f.getCategory(), f.getTitle(), f.getOriginalFilename(),
                f.getContentType(), f.getSizeBytes(), f.getCreatedAt(), users.get(f.getUploadedBy()))).toList();
    }

    /** Tope para cada archivo suelto; las series DICOM en ZIP tienen el suyo (90 MB). */
    static final long MAX_FILE_BYTES = 15L * 1024 * 1024;

    /**
     * Sube radiografías, fotos o documentos (JPG, PNG, WEBP, PDF o DICOM), o una serie DICOM en ZIP.
     * Sin transacción alrededor: un ZIP grande tarda unos segundos en revisarse y no debe retener una
     * conexión a la base de datos mientras tanto (el RLS se aplica igual al pedir la conexión).
     */
    public FileResponse upload(AuthUser me, UUID patientId, MultipartFile upload, FileCategory category, String title) {
        if (category == FileCategory.SIGNATURE) throw new BadRequestException("Categoría no válida");
        if (upload == null || upload.isEmpty()) throw new BadRequestException("Selecciona un archivo");
        String name = title == null || title.isBlank() ? baseName(upload.getOriginalFilename()) : title.trim();
        byte[] head;
        try (var in = upload.getInputStream()) {
            head = in.readNBytes(4);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        PatientFile saved = DicomSeriesArchive.isZip(head)
                ? storeSeries(me, patientId, upload, category, name)
                : tx.execute(status -> {
                    if (upload.getSize() > MAX_FILE_BYTES) throw new BadRequestException("El archivo supera 15 MB");
                    byte[] content;
                    try {
                        content = upload.getBytes();
                    } catch (IOException e) {
                        throw new UncheckedIOException(e);
                    }
                    var type = FileType.detect(content).orElseThrow(() -> new BadRequestException(
                            "Formato no permitido: usa JPG, PNG, WEBP, PDF, DICOM o un ZIP con imágenes DICOM"));
                    return store(me, patientId, content, type, category, name, upload.getOriginalFilename());
                });
        return new FileResponse(saved.getId(), saved.getCategory(), saved.getTitle(), saved.getOriginalFilename(),
                saved.getContentType(), saved.getSizeBytes(), saved.getCreatedAt(),
                access.userRefs(List.of(me.userId())).get(me.userId()));
    }

    /** Serie DICOM en ZIP: se depura en un archivo temporal y se sube desde el disco. */
    private PatientFile storeSeries(AuthUser me, UUID patientId, MultipartFile upload, FileCategory category, String title) {
        if (upload.getSize() > DicomSeriesArchive.MAX_ZIP_BYTES) throw new BadRequestException("El ZIP supera 90 MB");
        access.requirePatient(me.clinicId(), patientId);
        Path temp = null;
        String key = null;
        try {
            temp = Files.createTempFile("occlus-serie-", ".zip");
            DicomSeriesArchive.Result result;
            try (var in = upload.getInputStream()) {
                result = DicomSeriesArchive.repack(in, temp);
            }
            var type = FileType.DICOM_SERIES;
            UUID id = UUID.randomUUID();
            key = "clinics/%s/patients/%s/%s.%s".formatted(me.clinicId(), patientId, id, type.extension);
            storage.put(key, temp, type.contentType);
            String storedKey = key;
            return tx.execute(status -> record(me, patientId, storedKey, type, category,
                    title, upload.getOriginalFilename(), result.sizeBytes(), result.sha256()));
        } catch (IOException e) {
            if (key != null) storage.deleteQuietly(key);
            throw new UncheckedIOException(e);
        } catch (RuntimeException e) {
            if (key != null) storage.deleteQuietly(key);
            throw e;
        } finally {
            if (temp != null) {
                try {
                    Files.deleteIfExists(temp);
                } catch (IOException ignored) {
                    // El sistema limpia los temporales; no vale la pena fallar la subida por esto.
                }
            }
        }
    }

    public enum ImportOutcome { CREATED, DUPLICATE, INVALID_TYPE }

    /**
     * Migración: guarda un documento traído del programa anterior. No lanza excepción por formato no
     * permitido (devuelve INVALID_TYPE) para que el lote siga con los demás archivos; si el mismo contenido
     * ya está en el paciente, no lo repite.
     */
    @Transactional
    public ImportOutcome importDocument(AuthUser me, UUID patientId, byte[] content, String originalFilename,
                                       FileCategory category) {
        if (category == FileCategory.SIGNATURE) throw new BadRequestException("Categoría no válida");
        var type = FileType.detect(content);
        if (type.isEmpty()) return ImportOutcome.INVALID_TYPE;
        if (files.existsByClinicIdAndPatientIdAndSha256AndRemovedAtIsNull(me.clinicId(), patientId, sha256(content))) {
            return ImportOutcome.DUPLICATE;
        }
        store(me, patientId, content, type.get(), category, baseName(originalFilename), originalFilename);
        return ImportOutcome.CREATED;
    }

    /** Guarda el contenido en S3 y registra los metadatos. Lo usan también los consentimientos (firmas). */
    PatientFile store(AuthUser me, UUID patientId, byte[] content, FileType type, FileCategory category,
                      String title, String originalFilename) {
        access.requirePatient(me.clinicId(), patientId);
        UUID id = UUID.randomUUID();
        String key = "clinics/%s/patients/%s/%s.%s".formatted(me.clinicId(), patientId, id, type.extension);
        storage.put(key, content, type.contentType);
        try {
            return record(me, patientId, key, type, category, title, originalFilename, content.length, sha256(content));
        } catch (RuntimeException e) {
            storage.deleteQuietly(key);
            throw e;
        }
    }

    private PatientFile record(AuthUser me, UUID patientId, String key, FileType type, FileCategory category,
                               String title, String originalFilename, long size, String sha256) {
        var f = new PatientFile();
        f.setClinicId(me.clinicId());
        f.setPatientId(patientId);
        f.setCategory(category);
        f.setTitle(truncate(title, 150));
        f.setOriginalFilename(originalFilename == null ? null : truncate(originalFilename, 255));
        f.setContentType(type.contentType);
        f.setSizeBytes(size);
        f.setSha256(sha256);
        f.setStorageKey(key);
        f.setUploadedBy(me.userId());
        return files.saveAndFlush(f);
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
