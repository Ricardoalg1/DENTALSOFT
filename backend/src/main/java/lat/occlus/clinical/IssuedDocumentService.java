package lat.occlus.clinical;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

/** Incapacidades, remisiones, órdenes y constancias: se emiten firmadas por un profesional y quedan inmodificables. */
@Service
@RequiredArgsConstructor
public class IssuedDocumentService {

    public record Request(
            @NotNull @Pattern(regexp = "DISABILITY|REFERRAL|ORDER|CERTIFICATE") String kind,
            @NotBlank @Size(max = 150) String title,
            @NotBlank @Size(max = 10000) String body) {}

    public record Summary(UUID id, String kind, String title, Instant issuedAt, String professional) {}

    public record Response(UUID id, UUID patientId, String kind, String title, String body, Instant issuedAt,
                           String professional, String registration, UUID signatureId, String patient,
                           String identification, LocalDate birthDate, DocumentBrandingService.Branding clinic,
                           String hash, boolean integrityOk) {}

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final ClinicalAccess access;
    private final DocumentBrandingService branding;

    @Transactional
    public Response issue(AuthUser me, UUID patientId, Request req) {
        access.requireProfessional(me);
        var patient = access.requirePatient(me.clinicId(), patientId);
        var profile = branding.profile(me);
        if (profile.registration().isBlank()) throw new BadRequestException("Configura tu registro profesional en Mi cuenta antes de emitir documentos");
        if (profile.signatureId() == null) throw new BadRequestException("Configura tu firma en Mi cuenta antes de emitir documentos");
        var id = UUID.randomUUID();
        var issued = Instant.now().truncatedTo(ChronoUnit.MICROS);
        var clinic = json(branding.branding(me.clinicId()));
        var title = req.title().trim();
        var body = req.body().trim();
        var hash = hash(id, me.clinicId(), patientId, req.kind(), title, body, clinic, issued);
        jdbc.update("""
                insert into issued_document (id, clinic_id, patient_id, kind, title, body, author_id, professional_name, registration,
                  signature_id, patient_name, patient_identification, patient_birth_date, clinic_snapshot, issued_at, content_hash)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                id, me.clinicId(), patientId, req.kind(), title, body, me.userId(), profile.name(), profile.registration(),
                profile.signatureId(), patient.fullName(), patient.getDocumentType() + " " + patient.getDocumentNumber(),
                patient.getBirthDate(), clinic, java.sql.Timestamp.from(issued), hash);
        return get(me, id);
    }

    @Transactional(readOnly = true)
    public List<Summary> list(AuthUser me, UUID patientId) {
        access.requirePatient(me.clinicId(), patientId);
        return jdbc.query("""
                select id, kind, title, issued_at, professional_name from issued_document
                where clinic_id = ? and patient_id = ? order by issued_at desc limit 200""",
                (rs, i) -> new Summary(rs.getObject("id", UUID.class), rs.getString("kind"), rs.getString("title"),
                        rs.getTimestamp("issued_at").toInstant(), rs.getString("professional_name")),
                me.clinicId(), patientId);
    }

    @Transactional(readOnly = true)
    public Response get(AuthUser me, UUID id) {
        var rows = jdbc.query("select * from issued_document where id = ? and clinic_id = ?", (rs, i) -> {
            var issued = rs.getTimestamp("issued_at").toInstant();
            var snapshot = rs.getString("clinic_snapshot");
            var expected = hash(rs.getObject("id", UUID.class), rs.getObject("clinic_id", UUID.class), rs.getObject("patient_id", UUID.class),
                    rs.getString("kind"), rs.getString("title"), rs.getString("body"), snapshot, issued);
            return new Response(rs.getObject("id", UUID.class), rs.getObject("patient_id", UUID.class), rs.getString("kind"),
                    rs.getString("title"), rs.getString("body"), issued, rs.getString("professional_name"), rs.getString("registration"),
                    rs.getObject("signature_id", UUID.class), rs.getString("patient_name"), rs.getString("patient_identification"),
                    rs.getObject("patient_birth_date", LocalDate.class),
                    mapper.readValue(snapshot, DocumentBrandingService.Branding.class), rs.getString("content_hash"),
                    Objects.equals(expected, rs.getString("content_hash")));
        }, id, me.clinicId());
        if (rows.isEmpty()) throw new NotFoundException("Documento no encontrado");
        return rows.getFirst();
    }

    private String json(Object value) {
        return mapper.writeValueAsString(value);
    }

    private String hash(UUID id, UUID clinic, UUID patient, String kind, String title, String body, String clinicSnapshot, Instant issued) {
        try {
            var payload = json(List.of(id, clinic, patient, kind, title, body, clinicSnapshot, issued.toString()));
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
