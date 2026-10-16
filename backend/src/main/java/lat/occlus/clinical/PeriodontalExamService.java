package lat.occlus.clinical;

import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import lat.occlus.clinical.ClinicalDtos.NoteStatus;
import lat.occlus.clinical.ClinicalDtos.PerioChart;
import lat.occlus.clinical.ClinicalDtos.PerioChartEntry;
import lat.occlus.clinical.ClinicalDtos.PerioSide;
import lat.occlus.clinical.ClinicalDtos.PerioTooth;
import lat.occlus.clinical.ClinicalDtos.Ref;
import lat.occlus.shared.web.BadRequestException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

/**
 * Periodontograma de una evolución, con los campos del periodontograma de SEPA. Se guarda como JSON validado:
 * solo dientes permanentes (FDI) y valores dentro de rango; los dientes sin datos se descartan.
 * La inmutabilidad tras firmar la garantiza un trigger de Postgres.
 */
@Slf4j
@Service
@RequiredArgsConstructor
class PeriodontalChartService {

    private static final Set<Integer> TEETH = IntStream.rangeClosed(1, 4).boxed()
            .flatMap(q -> IntStream.rangeClosed(1, 8).mapToObj(n -> q * 10 + n))
            .collect(Collectors.toSet());
    private static final Set<String> PROGNOSES = Set.of("GOOD", "DOUBTFUL", "POOR", "HOPELESS");

    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final ClinicalAccess access;

    /** Los periodontogramas del paciente (borradores y firmados), del más reciente al más antiguo. */
    @Transactional(readOnly = true)
    public List<PerioChartEntry> byPatient(UUID clinicId, UUID patientId) {
        access.requirePatient(clinicId, patientId);
        List<PerioChartEntry> result = new ArrayList<>();
        jdbc.query("""
                select n.id, n.attended_at, n.signed_at, n.dentist_id, u.full_name, pc.data::text
                from periodontal_chart pc
                join clinical_note n on n.id = pc.note_id and n.clinic_id = pc.clinic_id
                join app_user u on u.id = n.dentist_id and u.clinic_id = n.clinic_id
                where pc.clinic_id = ? and pc.patient_id = ?
                order by n.attended_at desc, n.id
                limit 200""", rs -> {
            UUID id = rs.getObject(1, UUID.class);
            try {
                result.add(new PerioChartEntry(id,
                        rs.getTimestamp(2).toInstant().atZone(BOGOTA).toOffsetDateTime(),
                        rs.getTimestamp(3) == null ? NoteStatus.DRAFT : NoteStatus.SIGNED,
                        new Ref(rs.getObject(4, UUID.class), rs.getString(5)),
                        mapper.readValue(rs.getString(6), PerioChart.class)));
            } catch (JacksonException e) {
                log.warn("Periodontograma ilegible en la evolución {}: {}", id, e.getOriginalMessage());
            }
        }, clinicId, patientId);
        return result;
    }

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

    /** Guarda (o reemplaza) el periodontograma del borrador; {@code null} o vacío lo elimina. Requiere la evolución ya persistida. */
    void save(ClinicalNote note, PerioChart chart) {
        PerioChart clean = clean(chart);
        if (clean == null) {
            jdbc.update("delete from periodontal_chart where note_id = ?", note.getId());
            return;
        }
        jdbc.update("""
                insert into periodontal_chart (note_id, clinic_id, patient_id, data)
                values (?, ?, ?, ?::jsonb)
                on conflict (note_id) do update set data = excluded.data, updated_at = now()""",
                note.getId(), note.getClinicId(), note.getPatientId(), mapper.writeValueAsString(clean));
    }

    /** Periodontogramas de varias evoluciones en una consulta. */
    Map<UUID, PerioChart> byNotes(List<UUID> noteIds) {
        if (noteIds.isEmpty()) return Map.of();
        String marks = String.join(",", Collections.nCopies(noteIds.size(), "?"));
        Map<UUID, PerioChart> result = new java.util.HashMap<>();
        jdbc.query("select note_id, data::text from periodontal_chart where note_id in (" + marks + ")", rs -> {
            UUID id = rs.getObject("note_id", UUID.class);
            try {
                result.put(id, mapper.readValue(rs.getString(2), PerioChart.class));
            } catch (JacksonException e) {
                // Borradores guardados con el formato anterior (antes de los campos de SEPA): se muestran sin periodontograma.
                log.warn("Periodontograma ilegible en la evolución {}: {}", id, e.getOriginalMessage());
            }
        }, noteIds.toArray());
        return result;
    }

    private PerioChart clean(PerioChart chart) {
        if (chart == null || chart.teeth() == null) return null;
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
        return result.isEmpty() ? null : new PerioChart(result);
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
