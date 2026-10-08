package lat.occlus.patient;

import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lat.occlus.patient.PatientDtos.FieldChange;
import lat.occlus.patient.PatientDtos.PatientRequest;
import lat.occlus.patient.PatientDtos.PatientResponse;
import lat.occlus.patient.PatientDtos.PatientRevision;
import lat.occlus.patient.PatientDtos.PatientSummary;
import lat.occlus.shared.audit.AuditRevision;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.ConflictException;
import lat.occlus.shared.web.NotFoundException;
import lat.occlus.shared.web.PageResponse;
import lat.occlus.user.AppUser;
import lat.occlus.user.AppUserRepository;
import lombok.RequiredArgsConstructor;
import org.hibernate.envers.AuditReaderFactory;
import org.hibernate.envers.RevisionType;
import org.hibernate.envers.query.AuditEntity;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class PatientService {

    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");
    private static final int MAX_PAGE_SIZE = 100;

    private final PatientRepository patients;
    private final AppUserRepository users;
    private final EntityManager entityManager;

    /** Busca por nombre o documento. Cada palabra debe aparecer: "jose 1020" → José … con documento 1020…. */
    @Transactional(readOnly = true)
    public PageResponse<PatientSummary> search(UUID clinicId, String query, int page, int size) {
        Specification<Patient> spec = (root, q, cb) -> cb.equal(root.get("clinicId"), clinicId);
        if (query != null && !query.isBlank()) {
            for (String term : Patient.normalize(query).split("\\s+")) {
                String pattern = "%" + term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
                spec = spec.and((root, q, cb) -> cb.like(root.get("searchKey"), pattern, '\\'));
            }
        }
        var pageable = PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, MAX_PAGE_SIZE),
                Sort.by("firstLastName", "secondLastName", "firstName"));
        LocalDate today = LocalDate.now(BOGOTA);
        return PageResponse.from(patients.findAll(spec, pageable), p -> new PatientSummary(
                p.getId(), p.getDocumentType(), p.getDocumentNumber(), p.fullName(), p.age(today),
                p.getPhone(), p.getRegime(), p.getInsurer(), p.isActive()));
    }

    @Transactional(readOnly = true)
    public PatientResponse get(UUID clinicId, UUID id) {
        return toResponse(find(clinicId, id));
    }

    @Transactional
    public PatientResponse create(UUID clinicId, PatientRequest req) {
        String number = req.documentNumber().trim().toUpperCase();
        if (patients.existsByClinicIdAndDocumentTypeAndDocumentNumber(clinicId, req.documentType(), number)) {
            throw new ConflictException("Ya existe un paciente con ese documento");
        }
        var patient = new Patient();
        patient.setClinicId(clinicId);
        apply(patient, req);
        return toResponse(patients.save(patient));
    }

    @Transactional
    public PatientResponse update(UUID clinicId, UUID id, PatientRequest req) {
        var patient = find(clinicId, id);
        String number = req.documentNumber().trim().toUpperCase();
        boolean documentChanged = patient.getDocumentType() != req.documentType()
                || !patient.getDocumentNumber().equals(number);
        if (documentChanged
                && patients.existsByClinicIdAndDocumentTypeAndDocumentNumber(clinicId, req.documentType(), number)) {
            throw new ConflictException("Ya existe un paciente con ese documento");
        }
        apply(patient, req);
        // flush para que @PreUpdate/@UpdateTimestamp se reflejen en la respuesta.
        patients.flush();
        return toResponse(patient);
    }

    /** Historial de versiones a partir de las tablas de Envers, de la más reciente a la más antigua. */
    @Transactional(readOnly = true)
    public List<PatientRevision> history(UUID clinicId, UUID id) {
        find(clinicId, id);
        @SuppressWarnings("unchecked")
        List<Object[]> rows = AuditReaderFactory.get(entityManager).createQuery()
                .forRevisionsOfEntity(Patient.class, false, true)
                .add(AuditEntity.id().eq(id))
                .addOrder(AuditEntity.revisionNumber().asc())
                .getResultList();

        Map<UUID, String> userNames = users.findAllById(rows.stream()
                        .map(r -> ((AuditRevision) r[1]).getUserId())
                        .filter(Objects::nonNull)
                        .collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(AppUser::getId, AppUser::getFullName));

        var result = new ArrayList<PatientRevision>();
        Map<String, String> previous = Map.of();
        for (Object[] row : rows) {
            var patient = (Patient) row[0];
            var revision = (AuditRevision) row[1];
            var type = (RevisionType) row[2];
            Map<String, String> current = auditedValues(patient);
            result.add(new PatientRevision(revision.getId(), Instant.ofEpochMilli(revision.getTimestamp()),
                    revision.getUserId(), userNames.get(revision.getUserId()), typeLabel(type),
                    type == RevisionType.ADD ? List.of() : diff(previous, current)));
            previous = current;
        }
        return result.reversed();
    }

    private Patient find(UUID clinicId, UUID id) {
        return patients.findByIdAndClinicId(id, clinicId)
                .orElseThrow(() -> new NotFoundException("Paciente no encontrado"));
    }

    private static void apply(Patient p, PatientRequest req) {
        LocalDate today = LocalDate.now(BOGOTA);
        boolean minor = req.birthDate() != null && req.birthDate().plusYears(18).isAfter(today);
        if (minor && isBlank(req.guardianName())) {
            throw new BadRequestException("Para pacientes menores de edad el acudiente es obligatorio");
        }
        p.setDocumentType(req.documentType());
        p.setDocumentNumber(req.documentNumber().trim().toUpperCase());
        p.setFirstName(req.firstName().trim());
        p.setMiddleName(clean(req.middleName()));
        p.setFirstLastName(req.firstLastName().trim());
        p.setSecondLastName(clean(req.secondLastName()));
        p.setBirthDate(req.birthDate());
        p.setSex(req.sex());
        p.setPhone(clean(req.phone()));
        p.setEmail(clean(req.email()) == null ? null : req.email().trim().toLowerCase());
        p.setAddress(clean(req.address()));
        p.setMunicipality(clean(req.municipality()));
        p.setResidenceZone(req.residenceZone());
        p.setRegime(req.regime());
        p.setInsurer(clean(req.insurer()));
        p.setOccupation(clean(req.occupation()));
        p.setGuardianName(clean(req.guardianName()));
        p.setGuardianPhone(clean(req.guardianPhone()));
        p.setGuardianRelationship(clean(req.guardianRelationship()));
        p.setNotes(clean(req.notes()));
        if (req.active() != null) p.setActive(req.active());
        if (req.whatsappConsent() != null && req.whatsappConsent() != p.isWhatsappConsent()) {
            p.setWhatsappConsent(req.whatsappConsent());
            // Fecha de la autorización (o null si la retira): sirve como soporte ante la SIC.
            p.setWhatsappConsentAt(req.whatsappConsent() ? java.time.Instant.now() : null);
        }
    }

    private static PatientResponse toResponse(Patient p) {
        return new PatientResponse(p.getId(), p.getDocumentType(), p.getDocumentNumber(),
                p.getFirstName(), p.getMiddleName(), p.getFirstLastName(), p.getSecondLastName(), p.fullName(),
                p.getBirthDate(), p.age(LocalDate.now(BOGOTA)), p.getSex(),
                p.getPhone(), p.getEmail(), p.getAddress(), p.getMunicipality(), p.getResidenceZone(),
                p.getRegime(), p.getInsurer(), p.getOccupation(),
                p.getGuardianName(), p.getGuardianPhone(), p.getGuardianRelationship(),
                p.getNotes(), p.isActive(), p.isWhatsappConsent(), p.getWhatsappConsentAt(),
                p.getCreatedAt(), p.getUpdatedAt());
    }

    /** Campos que se muestran en el historial, con etiquetas en español. */
    private static final Map<String, Function<Patient, Object>> AUDITED_FIELDS = new LinkedHashMap<>();

    static {
        AUDITED_FIELDS.put("Tipo de documento", Patient::getDocumentType);
        AUDITED_FIELDS.put("Número de documento", Patient::getDocumentNumber);
        AUDITED_FIELDS.put("Primer nombre", Patient::getFirstName);
        AUDITED_FIELDS.put("Segundo nombre", Patient::getMiddleName);
        AUDITED_FIELDS.put("Primer apellido", Patient::getFirstLastName);
        AUDITED_FIELDS.put("Segundo apellido", Patient::getSecondLastName);
        AUDITED_FIELDS.put("Fecha de nacimiento", Patient::getBirthDate);
        AUDITED_FIELDS.put("Sexo", Patient::getSex);
        AUDITED_FIELDS.put("Teléfono", Patient::getPhone);
        AUDITED_FIELDS.put("Correo", Patient::getEmail);
        AUDITED_FIELDS.put("Dirección", Patient::getAddress);
        AUDITED_FIELDS.put("Municipio", Patient::getMunicipality);
        AUDITED_FIELDS.put("Zona", Patient::getResidenceZone);
        AUDITED_FIELDS.put("Régimen", Patient::getRegime);
        AUDITED_FIELDS.put("Aseguradora (EPS)", Patient::getInsurer);
        AUDITED_FIELDS.put("Ocupación", Patient::getOccupation);
        AUDITED_FIELDS.put("Acudiente", Patient::getGuardianName);
        AUDITED_FIELDS.put("Teléfono acudiente", Patient::getGuardianPhone);
        AUDITED_FIELDS.put("Parentesco acudiente", Patient::getGuardianRelationship);
        AUDITED_FIELDS.put("Notas", Patient::getNotes);
        AUDITED_FIELDS.put("Activo", p -> p.isActive() ? "Sí" : "No");
        AUDITED_FIELDS.put("Autoriza WhatsApp", p -> p.isWhatsappConsent() ? "Sí" : "No");
    }

    private static Map<String, String> auditedValues(Patient p) {
        var values = new LinkedHashMap<String, String>();
        AUDITED_FIELDS.forEach((label, getter) -> values.put(label, Objects.toString(getter.apply(p), null)));
        return values;
    }

    private static List<FieldChange> diff(Map<String, String> before, Map<String, String> after) {
        return after.keySet().stream()
                .filter(k -> !Objects.equals(before.get(k), after.get(k)))
                .map(k -> new FieldChange(k, before.get(k), after.get(k)))
                .toList();
    }

    private static String typeLabel(RevisionType type) {
        return switch (type) {
            case ADD -> "CREATED";
            case MOD -> "UPDATED";
            case DEL -> "DELETED";
        };
    }

    private static String clean(String s) {
        return isBlank(s) ? null : s.trim();
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
