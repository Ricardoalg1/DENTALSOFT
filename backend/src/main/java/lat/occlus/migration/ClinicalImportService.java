package lat.occlus.migration;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import lat.occlus.clinical.FileCategory;
import lat.occlus.clinical.PatientFileService;
import lat.occlus.migration.LegacyValues.RowException;
import lat.occlus.migration.MigrationDtos.BatchResponse;
import lat.occlus.migration.MigrationDtos.ClinicalImportRequest;
import lat.occlus.migration.MigrationDtos.DocumentImportResponse;
import lat.occlus.migration.MigrationDtos.DocumentImportStatus;
import lat.occlus.migration.MigrationDtos.ImportReport;
import lat.occlus.migration.MigrationDtos.ImportRow;
import lat.occlus.migration.MigrationDtos.LegacyRecordResponse;
import lat.occlus.migration.MigrationDtos.RowIssue;
import lat.occlus.patient.DocumentType;
import lat.occlus.patient.Patient;
import lat.occlus.patient.PatientRepository;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.ConflictException;
import lat.occlus.shared.web.NotFoundException;
import lat.occlus.shared.web.Ref;
import lat.occlus.user.AppUser;
import lat.occlus.user.AppUserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Limit;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * Historia clínica del programa anterior: registros de atención (desde Excel/CSV) y documentos (PDF,
 * radiografías, fotos). Se vinculan al paciente por su número de documento, así que primero se importan
 * los pacientes.
 */
@Service
@RequiredArgsConstructor
public class ClinicalImportService {

    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");
    /** "K02.1 - Caries de la dentina" en una sola celda. */
    private static final Pattern CODE_AND_TEXT = Pattern.compile("([A-Za-z]\\d{2}\\.?[0-9A-Za-z]{0,3})\\s*[-–:]\\s*(.+)");
    private static final Pattern ICD_CODE = Pattern.compile("[A-Z]\\d{2}[0-9A-Z]{0,3}");

    private final LegacyClinicalRecordRepository records;
    private final PatientRepository patients;
    private final AppUserRepository users;
    private final MigrationBatches batches;
    private final PatientFileService patientFiles;
    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate named;

    // ---------- Registros de atención ----------

    private record Parsed(int row, DocumentType documentType, String documentNumber, LegacyValues.ParsedDate date,
                          String recordType, String professional, String reason, String diagnosisCode,
                          String diagnosisDescription, String description, String procedures, String plan) {}

    @Transactional
    public ImportReport importRecords(AuthUser me, ClinicalImportRequest req) {
        boolean dryRun = req.batchId() == null;
        var batch = dryRun ? null : batches.requireOpen(me.clinicId(), req.batchId(), MigrationKind.CLINICAL_RECORDS);
        var errors = new ArrayList<RowIssue>();
        var parsed = new ArrayList<Parsed>();
        for (ImportRow row : req.rows()) {
            try {
                parsed.add(parse(row));
            } catch (RowException e) {
                errors.add(new RowIssue(row.row(), e.getMessage()));
            }
        }

        var byNumber = patientsByNumber(me.clinicId(), parsed.stream().map(Parsed::documentNumber).toList());
        Map<String, String> catalog = icd10Descriptions(parsed.stream()
                .filter(p -> p.diagnosisCode() != null && p.diagnosisDescription() == null)
                .map(Parsed::diagnosisCode).collect(Collectors.toSet()));

        var resolved = new ArrayList<LegacyClinicalRecord>();
        for (Parsed p : parsed) {
            Patient patient;
            try {
                patient = resolvePatient(byNumber, p.documentType(), p.documentNumber());
            } catch (RowException e) {
                errors.add(new RowIssue(p.row(), e.getMessage()));
                continue;
            }
            var r = new LegacyClinicalRecord();
            r.setClinicId(me.clinicId());
            r.setPatientId(patient.getId());
            r.setAttendedAt(p.date().value().atZone(BOGOTA).toInstant().truncatedTo(ChronoUnit.MICROS));
            r.setDateOnly(p.date().dateOnly());
            r.setRecordType(p.recordType());
            r.setProfessionalName(p.professional());
            r.setReason(p.reason());
            r.setDiagnosisCode(p.diagnosisCode());
            r.setDiagnosisDescription(p.diagnosisDescription() != null ? p.diagnosisDescription()
                    : p.diagnosisCode() == null ? null : catalog.get(p.diagnosisCode()));
            r.setDescription(p.description());
            r.setProcedures(p.procedures());
            r.setPlan(p.plan());
            r.setContentHash(r.computeHash());
            resolved.add(r);
        }

        // Lo que ya se importó antes (mismo paciente y mismo contenido) no se repite.
        Set<String> known = new HashSet<>();
        var patientIds = resolved.stream().map(LegacyClinicalRecord::getPatientId).collect(Collectors.toSet());
        if (!patientIds.isEmpty()) {
            for (Object[] k : records.existingHashes(me.clinicId(), patientIds)) known.add(k[0] + ":" + k[1]);
        }
        int created = 0, skipped = 0;
        for (var r : resolved) {
            if (!known.add(r.getPatientId() + ":" + r.getContentHash())) {
                skipped++;
                continue;
            }
            created++;
            if (dryRun) continue;
            r.setBatchId(batch.getId());
            r.setSourceSystem(batch.getSourceSystem());
            r.setImportedBy(me.userId());
            records.save(r);
        }
        if (!dryRun) batches.addCounts(batch, created, 0, skipped, errors.size());
        errors.sort((a, b) -> Integer.compare(a.row(), b.row()));
        return new ImportReport(created, 0, skipped, errors, List.of());
    }

    private static Parsed parse(ImportRow row) {
        Map<String, String> v = row.values();
        String number = LegacyValues.documentNumber(v.get("documentNumber"));
        if (number == null) throw new RowException("Falta el número de documento del paciente");
        var date = LegacyValues.dateTime(v.get("attendedAt"), "Fecha de atención");
        if (date == null) throw new RowException("Falta la fecha de atención");
        var instant = date.value().atZone(BOGOTA).toInstant();
        if (instant.isAfter(Instant.now().plus(Duration.ofDays(1))) || date.value().getYear() < 1950) {
            throw new RowException("Fecha de atención fuera de rango: " + date.value().toLocalDate());
        }

        String code = LegacyValues.text(v.get("diagnosisCode"));
        String dxText = LegacyValues.text(v.get("diagnosisDescription"));
        if (code != null) {
            Matcher m = CODE_AND_TEXT.matcher(code);
            if (m.matches()) {
                if (dxText == null) dxText = m.group(2).strip();
                code = m.group(1);
            }
            String normalized = code.toUpperCase().replaceAll("[\\s.]", "");
            if (ICD_CODE.matcher(normalized).matches()) {
                code = normalized;
            } else {
                // No parece un código CIE-10: se conserva como texto del diagnóstico.
                dxText = dxText == null ? code : code + " — " + dxText;
                code = null;
            }
        }

        var p = new Parsed(row.row(), LegacyValues.documentType(v.get("documentType")), number, date,
                limit(v.get("recordType"), 80, "El tipo de registro"),
                limit(v.get("professional"), 150, "El profesional"),
                limit(v.get("reason"), 2000, "El motivo de consulta"),
                code,
                dxText == null ? null : limit(dxText, 500, "La descripción del diagnóstico"),
                limit(v.get("description"), 20_000, "La evolución / descripción"),
                limit(v.get("procedures"), 4000, "Los procedimientos"),
                limit(v.get("plan"), 4000, "El plan de tratamiento"));
        if (p.reason() == null && p.description() == null && p.procedures() == null && p.plan() == null
                && p.diagnosisCode() == null && p.diagnosisDescription() == null) {
            throw new RowException("La fila no tiene contenido clínico (motivo, diagnóstico, evolución, procedimientos o plan)");
        }
        return p;
    }

    /** El contenido clínico no se recorta: si no cabe, la fila se rechaza para que la clínica decida. */
    private static String limit(String raw, int max, String label) {
        String s = LegacyValues.text(raw);
        if (s != null && s.length() > max) throw new RowException("%s supera %,d caracteres".formatted(label, max));
        return s;
    }

    private Map<String, List<Patient>> patientsByNumber(UUID clinicId, Collection<String> numbers) {
        if (numbers.isEmpty()) return Map.of();
        return patients.findByClinicIdAndDocumentNumberIn(clinicId, new HashSet<>(numbers)).stream()
                .collect(Collectors.groupingBy(Patient::getDocumentNumber));
    }

    private static Patient resolvePatient(Map<String, List<Patient>> byNumber, DocumentType type, String number) {
        var candidates = byNumber.getOrDefault(number, List.of()).stream()
                .filter(p -> type == null || p.getDocumentType() == type).toList();
        if (candidates.isEmpty()) {
            throw new RowException("No hay un paciente con documento %s: importa primero los pacientes".formatted(number));
        }
        if (candidates.size() > 1) {
            throw new RowException("Hay varios pacientes con el número %s: incluye la columna de tipo de documento".formatted(number));
        }
        return candidates.getFirst();
    }

    private Map<String, String> icd10Descriptions(Set<String> codes) {
        if (codes.isEmpty()) return Map.of();
        var out = new HashMap<String, String>();
        named.query("select code, description from icd10 where code in (:codes)", Map.of("codes", codes),
                rs -> { out.put(rs.getString(1), rs.getString(2)); });
        return out;
    }

    // ---------- Consulta ----------

    @Transactional(readOnly = true)
    public List<LegacyRecordResponse> byPatient(UUID clinicId, UUID patientId) {
        patients.findByIdAndClinicId(patientId, clinicId).orElseThrow(() -> new NotFoundException("Paciente no encontrado"));
        var list = records.findByClinicIdAndPatientIdAndVoidedAtIsNullOrderByAttendedAtDesc(clinicId, patientId, Limit.of(2000));
        Map<UUID, Ref> names = users.findAllById(list.stream().map(LegacyClinicalRecord::getImportedBy).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(AppUser::getId, u -> new Ref(u.getId(), u.getFullName())));
        return list.stream().map(r -> new LegacyRecordResponse(r.getId(), r.getSourceSystem(),
                OffsetDateTime.ofInstant(r.getAttendedAt(), BOGOTA), r.isDateOnly(), r.getRecordType(),
                r.getProfessionalName(), r.getReason(), r.getDiagnosisCode(), r.getDiagnosisDescription(),
                r.getDescription(), r.getProcedures(), r.getPlan(), r.getImportedAt(), names.get(r.getImportedBy()),
                r.computeHash().equals(r.getContentHash()))).toList();
    }

    /**
     * Anula un lote de historia clínica importado por error: los registros quedan guardados (no se borran)
     * pero dejan de mostrarse, y el mismo archivo se puede volver a importar.
     */
    @Transactional
    public BatchResponse voidBatch(AuthUser me, UUID batchId, String reason) {
        var batch = batches.find(me.clinicId(), batchId);
        if (batch.getKind() != MigrationKind.CLINICAL_RECORDS) {
            throw new BadRequestException("Solo se pueden anular importaciones de historia clínica");
        }
        if (batch.getVoidedAt() != null) throw new ConflictException("El lote ya fue anulado");
        var now = Instant.now();
        batch.setVoidedAt(now);
        batch.setVoidedBy(me.userId());
        batch.setVoidReason(reason.strip());
        // UPDATE directo: la entidad es @Immutable y la BD solo deja cambiar las columnas de anulación.
        jdbc.update("""
                update legacy_clinical_record set voided_at = ?, voided_by = ?, void_reason = ?
                where batch_id = ? and clinic_id = ? and voided_at is null""",
                OffsetDateTime.ofInstant(now, BOGOTA), me.userId(), reason.strip(), batchId, me.clinicId());
        return batches.get(me.clinicId(), batchId);
    }

    // ---------- Documentos ----------

    /** Un archivo de la carpeta del programa anterior; el navegador sacó el documento del paciente de su nombre. */
    @Transactional
    public DocumentImportResponse importDocument(AuthUser me, UUID batchId, String documentNumber,
                                                 DocumentType documentType, FileCategory category, MultipartFile file) {
        var batch = batches.requireOpen(me.clinicId(), batchId, MigrationKind.DOCUMENTS);
        if (file == null || file.isEmpty()) throw new BadRequestException("Selecciona un archivo");
        Patient patient;
        try {
            String number = LegacyValues.documentNumber(documentNumber);
            if (number == null) throw new RowException("Falta el número de documento");
            patient = resolvePatient(patientsByNumber(me.clinicId(), List.of(number)), documentType, number);
        } catch (RowException e) {
            batches.addCounts(batch, 0, 0, 0, 1);
            return new DocumentImportResponse(DocumentImportStatus.PATIENT_NOT_FOUND, null, e.getMessage());
        }
        byte[] content;
        try {
            content = file.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        var ref = new Ref(patient.getId(), patient.fullName());
        return switch (patientFiles.importDocument(me, patient.getId(), content, file.getOriginalFilename(), category)) {
            case CREATED -> {
                batches.addCounts(batch, 1, 0, 0, 0);
                yield new DocumentImportResponse(DocumentImportStatus.CREATED, ref, null);
            }
            case DUPLICATE -> {
                batches.addCounts(batch, 0, 0, 1, 0);
                yield new DocumentImportResponse(DocumentImportStatus.DUPLICATE, ref, "El paciente ya tiene este archivo");
            }
            case INVALID_TYPE -> {
                batches.addCounts(batch, 0, 0, 0, 1);
                yield new DocumentImportResponse(DocumentImportStatus.INVALID, ref, "Formato no permitido: usa PDF, JPG, PNG o WEBP");
            }
        };
    }
}
