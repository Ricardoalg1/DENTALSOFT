package lat.occlus.clinical;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import lat.occlus.clinical.ClinicalDtos.NoteStatus;
import lat.occlus.clinical.ClinicalDtos.PerioChart;
import lat.occlus.clinical.ClinicalDtos.PerioExamRequest;
import lat.occlus.clinical.ClinicalDtos.PerioExamResponse;
import lat.occlus.clinical.ClinicalDtos.PerioSide;
import lat.occlus.clinical.ClinicalDtos.PerioTooth;
import lat.occlus.clinical.ClinicalDtos.Ref;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.ConflictException;
import lat.occlus.shared.web.ForbiddenException;
import lat.occlus.shared.web.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

/**
 * Periodontogramas: exámenes periodontales propios del paciente (puede tener varios, uno por control), con los
 * campos del periodontograma de SEPA. Mismo ciclo que una evolución: borrador editable por su autor y, al firmarlo,
 * inmutable (trigger tg_periodontal_exam_immutable) con un hash que calcula Postgres (periodontal_exam_hash).
 * Los datos se guardan como JSON validado: solo dientes permanentes (FDI), valores en rango; dientes sin datos se descartan.
 */
@Service
@RequiredArgsConstructor
public class PeriodontalExamService {

    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");
    /** Margen para diferencias de reloj entre el navegador y el servidor. */
    private static final Duration CLOCK_SKEW = Duration.ofMinutes(5);
    private static final Set<Integer> TEETH = IntStream.rangeClosed(1, 4).boxed()
            .flatMap(q -> IntStream.rangeClosed(1, 8).mapToObj(n -> q * 10 + n))
            .collect(Collectors.toSet());
    private static final Set<String> PROGNOSES = Set.of("GOOD", "DOUBTFUL", "POOR", "HOPELESS");
    private static final String SELECT = """
            select e.id, e.patient_id, concat_ws(' ', p.first_name, p.middle_name, p.first_last_name, p.second_last_name) as patient_name,
                   e.dentist_id, u.full_name as dentist_name, e.examined_at, e.observations, e.data::text as data,
                   e.signed_at, e.content_hash, e.created_at, e.updated_at,
                   e.signed_at is not null and e.content_hash = periodontal_exam_hash(e) as integrity_ok
            from periodontal_exam e
            join patient p on p.id = e.patient_id and p.clinic_id = e.clinic_id
            join app_user u on u.id = e.dentist_id and u.clinic_id = e.clinic_id
            """;

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final ClinicalAccess access;

    /**
     * Entradas de furca de una cara: molares superiores 1 por vestibular y 2 por palatino (mesial y distal),
     * primeros premolares superiores 2 por palatino, molares inferiores 1 por cara. Los implantes no tienen.
     */
    static int furcationSites(int tooth, boolean buccal) {
        int quadrant = tooth / 10, n = tooth % 10;
        boolean upper = quadrant <= 2;
        if (n >= 6) return upper && !buccal ? 2 : 1;
        if (upper && n == 4 && !buccal) return 2;
        return 0;
    }

    @Transactional(readOnly = true)
    public List<PerioExamResponse> byPatient(UUID clinicId, UUID patientId) {
        access.requirePatient(clinicId, patientId);
        return jdbc.query(SELECT + " where e.clinic_id = ? and e.patient_id = ? order by e.examined_at desc, e.id limit 200",
                this::map, clinicId, patientId);
    }

    @Transactional(readOnly = true)
    public PerioExamResponse get(UUID clinicId, UUID id) {
        return find(clinicId, id);
    }

    @Transactional
    public PerioExamResponse create(AuthUser me, UUID patientId, PerioExamRequest req) {
        access.requireProfessional(me);
        var patient = access.requirePatient(me.clinicId(), patientId);
        UUID id = UUID.randomUUID();
        jdbc.update("""
                insert into periodontal_exam (id, clinic_id, patient_id, dentist_id, examined_at, observations, data)
                values (?, ?, ?, ?, ?, ?, ?::jsonb)""",
                id, me.clinicId(), patient.getId(), me.userId(), ts(examinedAt(req, Instant.now())),
                clean(req.observations()), mapper.writeValueAsString(clean(req.chart())));
        return find(me.clinicId(), id);
    }

    /** Editar un borrador. Solo su autor; los firmados no se tocan. */
    @Transactional
    public PerioExamResponse update(AuthUser me, UUID id, PerioExamRequest req) {
        var exam = findDraftOwnedBy(me, id);
        jdbc.update("update periodontal_exam set examined_at = ?, observations = ?, data = ?::jsonb, updated_at = now() where id = ?",
                ts(examinedAt(req, exam.examinedAt().toInstant())), clean(req.observations()),
                mapper.writeValueAsString(clean(req.chart())), id);
        return find(me.clinicId(), id);
    }

    @Transactional
    public void deleteDraft(AuthUser me, UUID id) {
        findDraftOwnedBy(me, id);
        jdbc.update("delete from periodontal_exam where id = ?", id);
    }

    /** Firma: a partir de aquí el periodontograma es inmutable. El hash incluye la fecha de firma. */
    @Transactional
    public PerioExamResponse sign(AuthUser me, UUID id) {
        var exam = findDraftOwnedBy(me, id);
        if (exam.chart().teeth().isEmpty()) throw new BadRequestException("Para firmar registra al menos un dato en el periodontograma");
        Instant signedAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
        // Una sola sentencia: después de firmar, el trigger ya no permite tocar la fila.
        jdbc.update("""
                update periodontal_exam e set signed_at = ?, content_hash = periodontal_exam_hash(row(
                    e.id, e.clinic_id, e.patient_id, e.dentist_id, e.examined_at, e.observations, e.data,
                    ?::timestamptz, null, e.created_at, e.updated_at)::periodontal_exam)
                where e.id = ? and e.signed_at is null""",
                ts(signedAt), ts(signedAt), id);
        return find(me.clinicId(), id);
    }

    private PerioExamResponse find(UUID clinicId, UUID id) {
        return jdbc.query(SELECT + " where e.clinic_id = ? and e.id = ?", this::map, clinicId, id).stream().findFirst()
                .orElseThrow(() -> new NotFoundException("Periodontograma no encontrado"));
    }

    private PerioExamResponse findDraftOwnedBy(AuthUser me, UUID id) {
        access.requireProfessional(me);
        var exam = find(me.clinicId(), id);
        if (exam.status() == NoteStatus.SIGNED) throw new ConflictException("El periodontograma está firmado y no se puede modificar");
        if (!exam.dentist().id().equals(me.userId())) {
            throw new ForbiddenException("Solo el profesional que lo registró puede editar o firmar este periodontograma");
        }
        return exam;
    }

    private Instant examinedAt(PerioExamRequest req, Instant fallback) {
        Instant at = req.examinedAt() == null ? fallback : req.examinedAt().toInstant();
        if (at.isAfter(Instant.now().plus(CLOCK_SKEW))) throw new BadRequestException("La fecha del examen no puede ser futura");
        return at.truncatedTo(ChronoUnit.MICROS);
    }

    private PerioExamResponse map(ResultSet rs, int row) throws SQLException {
        var signedAt = rs.getTimestamp("signed_at");
        return new PerioExamResponse(
                rs.getObject("id", UUID.class),
                new Ref(rs.getObject("patient_id", UUID.class), rs.getString("patient_name")),
                new Ref(rs.getObject("dentist_id", UUID.class), rs.getString("dentist_name")),
                rs.getTimestamp("examined_at").toInstant().atZone(BOGOTA).toOffsetDateTime(),
                signedAt == null ? NoteStatus.DRAFT : NoteStatus.SIGNED,
                rs.getString("observations"),
                mapper.readValue(rs.getString("data"), PerioChart.class),
                signedAt == null ? null : signedAt.toInstant(),
                rs.getString("content_hash"),
                signedAt == null ? null : rs.getBoolean("integrity_ok"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant());
    }

    /** Instante como timestamptz (el driver de Postgres lo envía con zona, sin depender de la del JVM). */
    private static java.time.OffsetDateTime ts(Instant instant) {
        return instant.atOffset(java.time.ZoneOffset.UTC);
    }

    private static String clean(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    /** Valida y normaliza; nunca null (sin datos = lista vacía). */
    private PerioChart clean(PerioChart chart) {
        if (chart == null || chart.teeth() == null) return new PerioChart(List.of());
        Set<Integer> seen = new HashSet<>();
        List<PerioTooth> result = new ArrayList<>();
        for (PerioTooth t : chart.teeth()) {
            if (t == null || t.tooth() == null || !TEETH.contains(t.tooth())) {
                throw new BadRequestException("Diente inválido en el periodontograma");
            }
            int n = t.tooth();
            if (!seen.add(n)) throw new BadRequestException("Diente repetido en el periodontograma: " + n);
            // Diente ausente: se borran todos sus datos, como en el formato de SEPA.
            if (Boolean.TRUE.equals(t.missing())) {
                result.add(new PerioTooth(n, true, null, null, null, null, null, null, null));
                continue;
            }
            boolean implant = Boolean.TRUE.equals(t.implant());
            Integer mobility = zeroToNull(range(t.mobility(), 0, 3, "movilidad"));
            String prognosis = t.prognosis() == null || t.prognosis().isBlank() ? null : t.prognosis();
            if (prognosis != null && !PROGNOSES.contains(prognosis)) throw new BadRequestException("Pronóstico inválido");
            Integer width = range(t.gingivalWidth(), 0, 20, "anchura de encía");
            String note = t.note() == null || t.note().isBlank() ? null : t.note().trim();
            PerioSide buccal = side(t.buccal(), implant ? 0 : furcationSites(n, true));
            PerioSide lingual = side(t.lingual(), implant ? 0 : furcationSites(n, false));
            if (!implant && mobility == null && prognosis == null && width == null && note == null
                    && buccal == null && lingual == null) continue;
            result.add(new PerioTooth(n, null, implant ? true : null, mobility, prognosis, width, note, buccal, lingual));
        }
        return new PerioChart(result);
    }

    /** Tres valores por arreglo; una cara sin ningún dato se descarta. */
    private PerioSide side(PerioSide s, int furcationSites) {
        if (s == null) return null;
        List<Integer> pd = sites(s.pd(), 0, 15, "profundidad de sondaje");
        List<Integer> gm = sites(s.gm(), -10, 15, "margen gingival");
        List<Integer> bop = sites(s.bop(), 0, 3, "sangrado").stream().map(v -> v == null ? 0 : v).toList();
        List<Boolean> suppuration = flags(s.suppuration());
        List<Boolean> plaque = flags(s.plaque());
        List<Integer> furcation = s.furcation() == null ? List.of() : s.furcation();
        if (furcation.size() > furcationSites) throw new BadRequestException("Esa cara del diente no tiene tantas entradas de furca");
        for (Integer v : furcation) range(v, 0, 3, "furca");
        furcation = furcation.stream().map(v -> v == null ? 0 : v).toList();
        if (furcation.stream().allMatch(v -> v == 0)) furcation = List.of();
        boolean empty = pd.stream().allMatch(v -> v == null || v == 0) && gm.stream().allMatch(v -> v == null || v == 0)
                && bop.stream().allMatch(v -> v == 0) && suppuration.stream().noneMatch(Boolean::booleanValue)
                && plaque.stream().noneMatch(Boolean::booleanValue) && furcation.isEmpty();
        return empty ? null : new PerioSide(pd, gm, bop, suppuration, plaque, furcation);
    }

    private static List<Integer> sites(List<Integer> values, int min, int max, String what) {
        if (values == null || values.size() != 3) throw new BadRequestException("Cada cara debe traer 3 sitios de " + what);
        for (Integer v : values) range(v, min, max, what);
        return new ArrayList<>(values);
    }

    private static List<Boolean> flags(List<Boolean> values) {
        if (values == null || values.size() != 3) throw new BadRequestException("Supuración y placa deben traer 3 sitios por cara");
        return values.stream().map(Boolean.TRUE::equals).toList();
    }

    private static Integer range(Integer v, int min, int max, String what) {
        if (v != null && (v < min || v > max)) throw new BadRequestException("Valor de " + what + " fuera de rango (" + min + " a " + max + ")");
        return v;
    }

    private static Integer zeroToNull(Integer v) {
        return v == null || v == 0 ? null : v;
    }
}
