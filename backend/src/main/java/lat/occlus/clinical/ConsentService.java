package lat.occlus.clinical;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import lat.occlus.clinic.ClinicRepository;
import lat.occlus.clinical.ClinicalDtos.Ref;
import lat.occlus.clinical.ConsentDtos.ConsentRequest;
import lat.occlus.clinical.ConsentDtos.ConsentResponse;
import lat.occlus.clinical.ConsentDtos.TemplateRequest;
import lat.occlus.clinical.ConsentDtos.TemplateResponse;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.ConflictException;
import lat.occlus.shared.web.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ConsentService {

    static final String SELF = "Paciente";
    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");
    private static final DateTimeFormatter LONG_DATE =
            DateTimeFormatter.ofPattern("d 'de' MMMM 'de' yyyy", Locale.forLanguageTag("es-CO"));
    private static final int MAX_SIGNATURE_BYTES = 500_000;

    private final ConsentTemplateRepository templates;
    private final ConsentRepository consents;
    private final PatientFileRepository files;
    private final PatientFileService fileService;
    private final ClinicRepository clinics;
    private final ClinicalAccess access;

    // ---------- Plantillas ----------

    @Transactional(readOnly = true)
    public List<TemplateResponse> templates(UUID clinicId, boolean includeInactive) {
        return templates.findByClinicIdOrderByTitle(clinicId).stream()
                .filter(t -> includeInactive || t.isActive())
                .map(ConsentService::toResponse)
                .toList();
    }

    @Transactional
    public TemplateResponse saveTemplate(UUID clinicId, UUID id, TemplateRequest req) {
        var t = id == null ? new ConsentTemplate()
                : templates.findByIdAndClinicId(id, clinicId).orElseThrow(() -> new NotFoundException("Plantilla no encontrada"));
        t.setClinicId(clinicId);
        t.setTitle(req.title().trim());
        t.setBody(req.body().strip());
        if (req.active() != null) t.setActive(req.active());
        return toResponse(templates.saveAndFlush(t));
    }

    /** Carga las plantillas de ejemplo que la clínica aún no tenga (por título). */
    @Transactional
    public List<TemplateResponse> loadExamples(UUID clinicId) {
        for (var example : DefaultConsentTemplates.EXAMPLES) {
            if (!templates.existsByClinicIdAndTitle(clinicId, example.title())) {
                var t = new ConsentTemplate();
                t.setClinicId(clinicId);
                t.setTitle(example.title());
                t.setBody(example.body());
                templates.save(t);
            }
        }
        templates.flush();
        return templates(clinicId, true);
    }

    // ---------- Consentimientos ----------

    @Transactional(readOnly = true)
    public List<ConsentResponse> byPatient(UUID clinicId, UUID patientId) {
        access.requirePatient(clinicId, patientId);
        return toResponses(consents.findByClinicIdAndPatientIdOrderBySignedAtDesc(clinicId, patientId));
    }

    @Transactional(readOnly = true)
    public ConsentResponse get(UUID clinicId, UUID id) {
        return toResponses(List.of(find(clinicId, id))).getFirst();
    }

    /**
     * Firma un consentimiento: copia el texto de la plantilla con los datos del paciente, guarda la
     * firma (PNG) en S3 y sella todo con un hash. A partir de aquí no se puede modificar.
     */
    @Transactional
    public ConsentResponse sign(AuthUser me, UUID patientId, ConsentRequest req) {
        var professional = access.requireProfessional(me);
        var patient = access.requirePatient(me.clinicId(), patientId);
        if (!patient.isActive()) throw new BadRequestException("El paciente está inactivo");
        var template = templates.findByIdAndClinicId(req.templateId(), me.clinicId())
                .filter(ConsentTemplate::isActive)
                .orElseThrow(() -> new BadRequestException("Plantilla no válida"));

        String relationship = req.signerRelationship().trim();
        boolean minor = patient.age(java.time.LocalDate.now(BOGOTA)) < 18;
        if (minor && relationship.equalsIgnoreCase(SELF)) {
            throw new BadRequestException("El paciente es menor de edad: debe firmar su acudiente o representante legal");
        }

        byte[] png = decodeSignature(req.signaturePng());
        var signature = fileService.store(me, patientId, png, FileType.PNG, FileCategory.SIGNATURE,
                "Firma: " + template.getTitle(), null);

        Instant signedAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
        String procedure = req.procedureDetail() == null || req.procedureDetail().isBlank()
                ? null : req.procedureDetail().trim();
        var clinic = clinics.findById(me.clinicId()).orElseThrow();
        String patientDocument = patient.getDocumentType() + " " + patient.getDocumentNumber();
        String signerName = req.signerName().trim();
        String signerDocument = req.signerDocument().trim();
        // Quién declara: el paciente, o el acudiente en nombre del paciente.
        String declarant = relationship.equalsIgnoreCase(SELF)
                ? "Yo, %s, identificado(a) con %s,".formatted(signerName, signerDocument)
                : "Yo, %s, identificado(a) con %s, en calidad de %s del(de la) paciente %s (%s),".formatted(
                        signerName, signerDocument, relationship.toLowerCase(Locale.ROOT), patient.fullName(), patientDocument);

        var c = new Consent();
        c.setId(UUID.randomUUID());
        c.setClinicId(me.clinicId());
        c.setPatientId(patientId);
        c.setTemplateId(template.getId());
        c.setTitle(template.getTitle());
        c.setBody(render(template.getBody(), Map.of(
                "declarante", declarant,
                "paciente", patient.fullName(),
                "documento", patientDocument,
                "profesional", professional.getFullName(),
                "clinica", clinic.getName(),
                "fecha", LONG_DATE.format(signedAt.atZone(BOGOTA)),
                "procedimiento", procedure == null ? "el procedimiento explicado por el profesional" : procedure)));
        c.setProcedureDetail(procedure);
        c.setSignerName(signerName);
        c.setSignerDocument(signerDocument);
        c.setSignerRelationship(relationship);
        c.setSignatureFileId(signature.getId());
        c.setProfessionalId(me.userId());
        c.setSignedAt(signedAt);
        c.setContentHash(c.computeHash(signature.getSha256()));
        return toResponses(List.of(consents.saveAndFlush(c))).getFirst();
    }

    /** El paciente retira su consentimiento. Queda registrado quién, cuándo y por qué. */
    @Transactional
    public ConsentResponse revoke(AuthUser me, UUID id, String reason) {
        access.requireProfessional(me);
        var c = find(me.clinicId(), id);
        if (c.getRevokedAt() != null) throw new ConflictException("El consentimiento ya fue revocado");
        c.setRevokedAt(Instant.now());
        c.setRevokedBy(me.userId());
        c.setRevocationReason(reason.trim());
        return toResponses(List.of(consents.saveAndFlush(c))).getFirst();
    }

    private Consent find(UUID clinicId, UUID id) {
        return consents.findByIdAndClinicId(id, clinicId).orElseThrow(() -> new NotFoundException("Consentimiento no encontrado"));
    }

    /** Reemplaza {{marcador}} por su valor; los marcadores desconocidos quedan tal cual. */
    static String render(String body, Map<String, String> values) {
        String out = body;
        for (var e : values.entrySet()) out = out.replace("{{" + e.getKey() + "}}", e.getValue());
        return out;
    }

    private static byte[] decodeSignature(String data) {
        String base64 = data.startsWith("data:") ? data.substring(data.indexOf(',') + 1) : data;
        byte[] png;
        try {
            png = Base64.getDecoder().decode(base64.trim());
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("La firma no es válida");
        }
        if (FileType.detect(png).filter(t -> t == FileType.PNG).isEmpty()) {
            throw new BadRequestException("La firma debe ser una imagen PNG");
        }
        if (png.length > MAX_SIGNATURE_BYTES) throw new BadRequestException("La imagen de la firma es demasiado grande");
        return png;
    }

    private List<ConsentResponse> toResponses(List<Consent> list) {
        if (list.isEmpty()) return List.of();
        Map<UUID, String> signatureHash = files.findAllById(list.stream().map(Consent::getSignatureFileId).toList())
                .stream().collect(Collectors.toMap(PatientFile::getId, PatientFile::getSha256));
        Map<UUID, Ref> users = access.userRefs(list.stream()
                .flatMap(c -> Stream.of(c.getProfessionalId(), c.getRevokedBy())).filter(Objects::nonNull).toList());
        var patient = access.requirePatient(list.getFirst().getClinicId(), list.getFirst().getPatientId());
        return list.stream().map(c -> {
            var p = c.getPatientId().equals(patient.getId()) ? patient : access.requirePatient(c.getClinicId(), c.getPatientId());
            return new ConsentResponse(c.getId(), new Ref(p.getId(), p.fullName()), c.getTitle(), c.getBody(),
                    c.getProcedureDetail(), c.getSignerName(), c.getSignerDocument(), c.getSignerRelationship(),
                    c.getSignatureFileId(), users.get(c.getProfessionalId()), c.getSignedAt(), c.getContentHash(),
                    c.computeHash(signatureHash.get(c.getSignatureFileId())).equals(c.getContentHash()),
                    c.getRevokedAt(), users.get(c.getRevokedBy()), c.getRevocationReason());
        }).toList();
    }

    private static TemplateResponse toResponse(ConsentTemplate t) {
        return new TemplateResponse(t.getId(), t.getTitle(), t.getBody(), t.isActive(), t.getUpdatedAt());
    }
}
