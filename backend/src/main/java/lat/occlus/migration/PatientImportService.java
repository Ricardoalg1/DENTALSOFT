package lat.occlus.migration;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import java.util.regex.Pattern;
import lat.occlus.clinical.ClinicalBackgroundService;
import lat.occlus.clinical.ClinicalBackgroundService.ImportedBackground;
import lat.occlus.migration.LegacyValues.RowException;
import lat.occlus.migration.MigrationDtos.ImportReport;
import lat.occlus.migration.MigrationDtos.ImportRow;
import lat.occlus.migration.MigrationDtos.NameOrder;
import lat.occlus.migration.MigrationDtos.OnExisting;
import lat.occlus.migration.MigrationDtos.PatientImportRequest;
import lat.occlus.migration.MigrationDtos.RowIssue;
import lat.occlus.patient.DocumentType;
import lat.occlus.patient.Patient;
import lat.occlus.patient.PatientRepository;
import lat.occlus.patient.Regime;
import lat.occlus.patient.ResidenceZone;
import lat.occlus.patient.Sex;
import lat.occlus.platform.AppModule;
import lat.occlus.platform.Entitlements;
import lat.occlus.shared.security.AuthUser;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Importa pacientes desde el archivo de otro programa. El navegador envía el archivo por partes, con las
 * columnas ya asignadas a los campos de abajo. Cada fila se valida por separado: las que tienen errores se
 * reportan y no se importan, el resto sí. Sin lote ({@code batchId} null) solo valida.
 */
@Service
@RequiredArgsConstructor
public class PatientImportService {

    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");
    private static final Pattern EMAIL = Pattern.compile("[^@\\s]+@[^@\\s]+\\.[^@\\s]+");

    private final PatientRepository patients;
    private final MigrationBatches batches;
    private final ClinicalBackgroundService backgrounds;
    private final Entitlements entitlements;

    /** Datos de una fila ya interpretados. null = el archivo no lo traía. */
    private record Parsed(
            int row, DocumentType documentType, String documentNumber,
            String firstName, String middleName, String firstLastName, String secondLastName,
            LocalDate birthDate, Sex sex, Regime regime,
            String phone, String email, String address, String municipality, ResidenceZone zone,
            String insurer, String occupation, String guardianName, String guardianPhone,
            String guardianRelationship, String notes, ImportedBackground background) {

        String key() {
            return documentType + "|" + documentNumber;
        }
    }

    @Transactional
    public ImportReport importRows(AuthUser me, PatientImportRequest req) {
        boolean dryRun = req.batchId() == null;
        var batch = dryRun ? null : batches.requireOpen(me.clinicId(), req.batchId(), MigrationKind.PATIENTS);
        boolean clinical = entitlements.allows(me.clinicId(), AppModule.CLINICAL_RECORD);
        var errors = new ArrayList<RowIssue>();
        var warnings = new ArrayList<RowIssue>();

        var parsed = new ArrayList<Parsed>();
        for (ImportRow row : req.rows()) {
            try {
                parsed.add(parse(row, req, warnings));
            } catch (RowException e) {
                errors.add(new RowIssue(row.row(), e.getMessage()));
            }
        }

        Map<String, Patient> existing = new HashMap<>();
        var numbers = parsed.stream().map(Parsed::documentNumber).toList();
        if (!numbers.isEmpty()) {
            for (Patient p : patients.findByClinicIdAndDocumentNumberIn(me.clinicId(), numbers)) {
                existing.put(p.getDocumentType() + "|" + p.getDocumentNumber(), p);
            }
        }

        int created = 0, updated = 0, skipped = 0;
        boolean warnedClinical = false;
        Set<String> seen = new HashSet<>();
        for (Parsed p : parsed) {
            if (!seen.add(p.key())) {
                errors.add(new RowIssue(p.row(), "El documento %s %s está repetido en el archivo"
                        .formatted(p.documentType(), p.documentNumber())));
                continue;
            }
            Patient current = existing.get(p.key());
            if (current != null && req.onExisting() == OnExisting.SKIP) {
                skipped++;
                continue;
            }
            if (current == null) {
                if (p.birthDate() == null) {
                    errors.add(new RowIssue(p.row(), "Falta la fecha de nacimiento"));
                    continue;
                }
                if (p.sex() == null) {
                    errors.add(new RowIssue(p.row(), "Falta el sexo"));
                    continue;
                }
            }
            if (!p.background().isEmpty() && !clinical && !warnedClinical) {
                warnings.add(new RowIssue(p.row(), "Tu plan no incluye Historia clínica: los antecedentes no se importaron"));
                warnedClinical = true;
            }
            if (current == null) created++;
            else updated++;
            if (dryRun) continue;

            var target = current;
            if (target == null) {
                target = new Patient();
                target.setClinicId(me.clinicId());
            }
            apply(target, p, req.defaultRegime(), current != null);
            patients.save(target);
            if (clinical) backgrounds.importLegacy(me.clinicId(), me.userId(), target.getId(), p.background());
        }
        if (!dryRun) batches.addCounts(batch, created, updated, skipped, errors.size());
        errors.sort((a, b) -> Integer.compare(a.row(), b.row()));
        return new ImportReport(created, updated, skipped, errors, warnings);
    }

    private static Parsed parse(ImportRow row, PatientImportRequest req, List<RowIssue> warnings) {
        Map<String, String> v = row.values();
        int n = row.row();
        String number = LegacyValues.documentNumber(v.get("documentNumber"));
        if (number == null) throw new RowException("Falta el número de documento");
        DocumentType type = LegacyValues.documentType(v.get("documentType"));
        if (type == null) type = req.defaultDocumentType();

        // Nombres: columnas separadas, nombres/apellidos juntos o el nombre completo en una sola columna.
        String first = LegacyValues.text(v.get("firstName"));
        String middle = LegacyValues.text(v.get("middleName"));
        String last1 = LegacyValues.text(v.get("firstLastName"));
        String last2 = LegacyValues.text(v.get("secondLastName"));
        String given = LegacyValues.text(v.get("givenNames"));
        if (first == null && given != null) {
            String[] g = LegacyValues.splitTwo(given);
            first = g[0];
            if (middle == null) middle = g[1];
        }
        String surnames = LegacyValues.text(v.get("surnames"));
        if (last1 == null && surnames != null) {
            String[] s = LegacyValues.splitTwo(surnames);
            last1 = s[0];
            if (last2 == null) last2 = s[1];
        }
        String full = LegacyValues.text(v.get("fullName"));
        if ((first == null || last1 == null) && full != null) {
            String[] f = LegacyValues.splitFullName(full, req.nameOrder() == NameOrder.SURNAME_FIRST);
            if (first == null) { first = f[0]; if (middle == null) middle = f[1]; }
            if (last1 == null) { last1 = f[2]; if (last2 == null) last2 = f[3]; }
        }
        if (first == null) throw new RowException("Falta el nombre");
        if (last1 == null) throw new RowException("Falta el primer apellido");
        boolean fix = !Boolean.FALSE.equals(req.fixUppercase());
        first = name(first, fix, "El nombre");
        middle = name(middle, fix, "El segundo nombre");
        last1 = name(last1, fix, "El primer apellido");
        last2 = name(last2, fix, "El segundo apellido");

        LocalDate birth = null;
        var parsedBirth = LegacyValues.dateTime(v.get("birthDate"), "Fecha de nacimiento");
        if (parsedBirth != null) {
            birth = parsedBirth.value().toLocalDate();
            if (birth.isAfter(LocalDate.now(BOGOTA)) || birth.getYear() < 1900) {
                throw new RowException("Fecha de nacimiento fuera de rango: " + birth);
            }
        }
        Sex sex = LegacyValues.sex(v.get("sex"), !Boolean.FALSE.equals(req.letterMIsMale()));

        String rawRegime = LegacyValues.text(v.get("regime"));
        Regime regime = LegacyValues.regime(rawRegime).orElse(null);
        if (rawRegime != null && regime == null) {
            warnings.add(new RowIssue(n, "Régimen «%s» no reconocido: se usó el predeterminado".formatted(rawRegime)));
        }
        String rawZone = LegacyValues.text(v.get("residenceZone"));
        ResidenceZone zone = LegacyValues.zone(rawZone);
        if (rawZone != null && zone == null) warnings.add(new RowIssue(n, "Zona «%s» no reconocida: se dejó vacía".formatted(rawZone)));

        String email = LegacyValues.text(v.get("email"));
        if (email != null) {
            email = email.toLowerCase();
            if (!EMAIL.matcher(email).matches() || email.length() > 160) {
                warnings.add(new RowIssue(n, "Correo «%s» no válido: no se importó".formatted(email)));
                email = null;
            }
        }

        String guardian = fit(v.get("guardianName"), 150, "Acudiente", n, warnings);
        if (birth != null && birth.plusYears(18).isAfter(LocalDate.now(BOGOTA)) && guardian == null) {
            warnings.add(new RowIssue(n, "Paciente menor de edad sin acudiente: complétalo en su ficha"));
        }

        var background = new ImportedBackground(
                fit(v.get("allergies"), 500, "Alergias", n, warnings),
                fit(v.get("medications"), 500, "Medicamentos", n, warnings),
                fit(v.get("surgicalHistory"), 500, "Antecedentes quirúrgicos", n, warnings),
                fit(v.get("familyHistory"), 500, "Antecedentes familiares", n, warnings),
                fit(v.get("clinicalObservations"), 1000, "Antecedentes / observaciones", n, warnings));

        return new Parsed(n, type, number, first, middle, last1, last2, birth, sex, regime,
                phone(v.get("phone"), n, warnings), email,
                fit(v.get("address"), 200, "Dirección", n, warnings),
                fit(v.get("municipality"), 80, "Municipio", n, warnings), zone,
                fit(v.get("insurer"), 120, "Aseguradora", n, warnings),
                fit(v.get("occupation"), 80, "Ocupación", n, warnings),
                fix ? LegacyValues.fixUppercase(guardian) : guardian,
                phone(v.get("guardianPhone"), n, warnings),
                fit(v.get("guardianRelationship"), 40, "Parentesco del acudiente", n, warnings),
                fit(v.get("notes"), 1000, "Notas", n, warnings), background);
    }

    /** Al actualizar, solo se reemplaza lo que el archivo trae (no se borra lo que ya había en Occlus). */
    private static void apply(Patient t, Parsed p, Regime defaultRegime, boolean update) {
        t.setDocumentType(p.documentType());
        t.setDocumentNumber(p.documentNumber());
        t.setFirstName(p.firstName());
        put(t::setMiddleName, p.middleName(), update);
        t.setFirstLastName(p.firstLastName());
        put(t::setSecondLastName, p.secondLastName(), update);
        put(t::setBirthDate, p.birthDate(), update);
        put(t::setSex, p.sex(), update);
        put(t::setRegime, p.regime() != null || update ? p.regime() : defaultRegime, update);
        put(t::setPhone, p.phone(), update);
        put(t::setEmail, p.email(), update);
        put(t::setAddress, p.address(), update);
        put(t::setMunicipality, p.municipality(), update);
        put(t::setResidenceZone, p.zone(), update);
        put(t::setInsurer, p.insurer(), update);
        put(t::setOccupation, p.occupation(), update);
        put(t::setGuardianName, p.guardianName(), update);
        put(t::setGuardianPhone, p.guardianPhone(), update);
        put(t::setGuardianRelationship, p.guardianRelationship(), update);
        put(t::setNotes, p.notes(), update);
    }

    private static <T> void put(Consumer<T> setter, T value, boolean update) {
        if (value != null || !update) setter.accept(value);
    }

    private static String name(String value, boolean fix, String label) {
        if (value == null) return null;
        String s = fix ? LegacyValues.fixUppercase(value) : value;
        if (s.length() > 60) throw new RowException(label + " supera 60 caracteres");
        return s;
    }

    /** Recorta lo que no cabe en la columna y avisa. */
    private static String fit(String raw, int max, String label, int row, List<RowIssue> warnings) {
        String s = LegacyValues.text(raw);
        if (s == null || s.length() <= max) return s;
        warnings.add(new RowIssue(row, "%s supera %d caracteres: se recortó".formatted(label, max)));
        return s.substring(0, max);
    }

    /** Varios teléfonos en una celda ("300… / 310…"): se toma el primero si no caben todos. */
    private static String phone(String raw, int row, List<RowIssue> warnings) {
        String s = LegacyValues.text(raw);
        if (s == null || s.length() <= 30) return s;
        String first = s.split("[/;,|]")[0].strip();
        warnings.add(new RowIssue(row, "Teléfono «%s» demasiado largo: se dejó «%s»".formatted(s, first.length() > 30 ? first.substring(0, 30) : first)));
        return first.length() > 30 ? first.substring(0, 30) : first;
    }
}
