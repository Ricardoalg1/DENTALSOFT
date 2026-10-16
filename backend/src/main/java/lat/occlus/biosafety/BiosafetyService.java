package lat.occlus.biosafety;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import lat.occlus.biosafety.BiosafetyDtos.KindCount;
import lat.occlus.biosafety.BiosafetyDtos.MaintenanceDue;
import lat.occlus.biosafety.BiosafetyDtos.RecordRequest;
import lat.occlus.biosafety.BiosafetyDtos.RecordResponse;
import lat.occlus.biosafety.BiosafetyDtos.Summary;
import lat.occlus.shared.access.StaffAccess;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.ConflictException;
import lat.occlus.shared.web.NotFoundException;
import lat.occlus.shared.web.PageResponse;
import lat.occlus.shared.web.Ref;
import lat.occlus.site.Site;
import lat.occlus.site.SiteRepository;
import lat.occlus.user.AppUserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/** Registros de bioseguridad: validación por tipo, consulta, anulación y alertas. */
@Service
@RequiredArgsConstructor
public class BiosafetyService {

    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");
    private static final TypeReference<LinkedHashMap<String, Object>> MAP = new TypeReference<>() {};
    private static final String SELECT = """
            select id, site_id, kind, record_date, responsible_id, data::text as data, notes, created_by, created_at,
                   voided_at, voided_by, void_reason
            from biosafety_record""";

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final SiteRepository sites;
    private final AppUserRepository users;
    private final StaffAccess access;

    private record Row(UUID id, UUID siteId, BiosafetyKind kind, LocalDate date, UUID responsibleId,
                       Map<String, Object> data, String notes, UUID createdBy, java.time.Instant createdAt,
                       java.time.Instant voidedAt, UUID voidedBy, String voidReason) {}

    @Transactional
    public RecordResponse register(AuthUser me, RecordRequest req) {
        sites.findById(req.siteId()).filter(s -> s.getClinicId().equals(me.clinicId()) && s.isActive())
                .orElseThrow(() -> new BadRequestException("Sede no válida"));
        UUID responsible = req.responsibleId() == null ? me.userId() : req.responsibleId();
        users.findByIdAndClinicId(responsible, me.clinicId()).filter(u -> u.isActive())
                .orElseThrow(() -> new BadRequestException("El responsable no es un usuario activo de la clínica"));
        LocalDate today = LocalDate.now(BOGOTA);
        LocalDate date = req.recordDate() == null ? today : req.recordDate();
        if (date.isAfter(today)) throw new BadRequestException("La fecha del registro no puede ser futura");
        var data = validate(req.kind(), req.data());
        if (req.kind() == BiosafetyKind.MAINTENANCE) linkEquipment(me.clinicId(), date, data);
        UUID id = UUID.randomUUID();
        jdbc.update("""
                insert into biosafety_record (id, clinic_id, site_id, kind, record_date, responsible_id, data, notes, created_by)
                values (?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?)""",
                id, me.clinicId(), req.siteId(), req.kind().name(), date, responsible, mapper.writeValueAsString(data),
                req.notes() == null || req.notes().isBlank() ? null : req.notes().trim(), me.userId());
        return toResponses(List.of(find(me.clinicId(), id))).getFirst();
    }

    /** Anula un registro (solo administradores). */
    @Transactional
    public RecordResponse voidRecord(AuthUser me, UUID id, String reason) {
        var row = find(me.clinicId(), id);
        if (row.voidedAt() != null) throw new ConflictException("El registro ya fue anulado");
        jdbc.update("update biosafety_record set voided_at = now(), voided_by = ?, void_reason = ? where id = ?",
                me.userId(), reason.trim(), id);
        return toResponses(List.of(find(me.clinicId(), id))).getFirst();
    }

    @Transactional(readOnly = true)
    public PageResponse<RecordResponse> search(UUID clinicId, BiosafetyKind kind, LocalDate from, LocalDate to,
                                               UUID siteId, int page, int size) {
        if (page < 0 || page > 100000 || size < 1 || size > 100) throw new BadRequestException("Página inválida");
        if (from.isAfter(to)) throw new BadRequestException("La fecha inicial es posterior a la final");
        var where = new StringBuilder(" where clinic_id = ? and record_date between ? and ?");
        var args = new ArrayList<Object>(List.of(clinicId, from, to));
        if (kind != null) { where.append(" and kind = ?"); args.add(kind.name()); }
        if (siteId != null) { where.append(" and site_id = ?"); args.add(siteId); }
        long count = jdbc.queryForObject("select count(*) from biosafety_record" + where, Long.class, args.toArray());
        int pages = (int) Math.ceil((double) count / size);
        int actual = pages == 0 ? 0 : Math.min(page, pages - 1);
        args.add(size);
        args.add(actual * size);
        var rows = jdbc.query(SELECT + where + " order by record_date desc, created_at desc limit ? offset ?", this::map, args.toArray());
        return new PageResponse<>(toResponses(rows), actual, size, count, pages);
    }

    /** Conteo de los últimos 30 días por tipo, hallazgos recientes (90 días) y mantenimientos por vencer. */
    @Transactional(readOnly = true)
    public Summary summary(UUID clinicId) {
        LocalDate today = LocalDate.now(BOGOTA);
        var counts = new ArrayList<KindCount>();
        for (var kind : BiosafetyKind.values()) {
            var r = jdbc.queryForMap("""
                    select count(*) filter (where record_date >= ?) as recent, max(record_date) as last
                    from biosafety_record where clinic_id = ? and kind = ? and voided_at is null""",
                    today.minusDays(30), clinicId, kind.name());
            var last = (java.sql.Date) r.get("last");
            counts.add(new KindCount(kind, ((Number) r.get("recent")).longValue(), last == null ? null : last.toLocalDate()));
        }
        var recent = jdbc.query(SELECT + " where clinic_id = ? and voided_at is null and record_date >= ? order by record_date desc, created_at desc limit 500",
                this::map, clinicId, today.minusDays(90));
        var alerts = toResponses(recent).stream().filter(r -> r.alert() != null).limit(20).toList();

        // Último mantenimiento por equipo y sede: su próximo vencimiento.
        var latest = new LinkedHashMap<String, Row>();
        jdbc.query(SELECT + " where clinic_id = ? and kind = 'MAINTENANCE' and voided_at is null order by record_date desc, created_at desc",
                        this::map, clinicId)
                .forEach(r -> latest.putIfAbsent(r.data().get("equipmentId") != null ? String.valueOf(r.data().get("equipmentId"))
                        : r.siteId() + "|" + String.valueOf(r.data().get("equipment")).toLowerCase(), r));
        Map<UUID, String> siteNames = siteNames(latest.values().stream().map(Row::siteId).toList());
        var due = latest.values().stream()
                .filter(r -> r.data().get("nextDue") != null)
                .map(r -> new MaintenanceDue(String.valueOf(r.data().get("equipment")), new Ref(r.siteId(), siteNames.get(r.siteId())),
                        LocalDate.parse(String.valueOf(r.data().get("nextDue"))), false))
                .filter(m -> !m.nextDue().isAfter(today.plusDays(30)))
                .map(m -> new MaintenanceDue(m.equipment(), m.site(), m.nextDue(), m.nextDue().isBefore(today)))
                .sorted(java.util.Comparator.comparing(MaintenanceDue::nextDue))
                .toList();
        return new Summary(counts, alerts, due);
    }

    /**
     * Mantenimiento: liga el equipo del inventario (guarda también su nombre para mostrarlo) y, si no se indicó la
     * próxima fecha, la calcula con la periodicidad del equipo.
     */
    private void linkEquipment(UUID clinicId, LocalDate date, Map<String, Object> data) {
        Object rawId = data.get("equipmentId");
        if (rawId == null) {
            if (data.get("equipment") == null) throw new BadRequestException("Elige el equipo del mantenimiento");
            return;
        }
        UUID equipmentId;
        try {
            equipmentId = UUID.fromString(rawId.toString());
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Equipo no válido");
        }
        var rows = jdbc.queryForList("select code, name, maintenance_months from equipment where id = ? and clinic_id = ?", equipmentId, clinicId);
        if (rows.isEmpty()) throw new BadRequestException("Equipo no válido");
        var e = rows.getFirst();
        data.put("equipmentId", equipmentId.toString());
        data.put("equipment", e.get("code") + " · " + e.get("name"));
        if (data.get("nextDue") == null && e.get("maintenance_months") != null) {
            data.put("nextDue", date.plusMonths(((Number) e.get("maintenance_months")).longValue()).toString());
        }
    }

    /** Equipos del inventario para elegir en un mantenimiento (sin los dados de baja). */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> equipmentOptions(UUID clinicId) {
        return jdbc.query("select e.id, e.code, e.name, e.kind, s.name as site from equipment e join site s on s.id = e.site_id "
                        + "where e.clinic_id = ? and e.status <> 'RETIRED' order by lower(e.name)",
                (rs, i) -> Map.<String, Object>of("id", rs.getObject("id", UUID.class), "code", rs.getString("code"),
                        "name", rs.getString("name"), "kind", rs.getString("kind"), "site", rs.getString("site")), clinicId);
    }

    /** Valida los campos del tipo y devuelve solo los conocidos, normalizados. */
    static Map<String, Object> validate(BiosafetyKind kind, Map<String, Object> input) {
        var out = new LinkedHashMap<String, Object>();
        for (var f : kind.fields()) {
            Object raw = input.get(f.name());
            boolean empty = raw == null || (raw instanceof String s && s.isBlank());
            if (empty) {
                if (f.required()) throw new BadRequestException("Falta el campo " + f.name());
                continue;
            }
            out.put(f.name(), switch (f.type()) {
                case TEXT -> {
                    String s = raw.toString().trim();
                    if (s.length() > f.maxLength()) throw new BadRequestException("El campo " + f.name() + " supera " + f.maxLength() + " caracteres");
                    yield s;
                }
                case NUMBER -> {
                    double v;
                    try {
                        v = raw instanceof Number n ? n.doubleValue() : Double.parseDouble(raw.toString().replace(',', '.'));
                    } catch (NumberFormatException e) {
                        throw new BadRequestException("El campo " + f.name() + " debe ser numérico");
                    }
                    if (!Double.isFinite(v) || v < f.min() || v > f.max()) {
                        throw new BadRequestException("El campo " + f.name() + " está fuera de rango");
                    }
                    yield v;
                }
                case DATE -> {
                    try {
                        yield LocalDate.parse(raw.toString()).toString();
                    } catch (DateTimeParseException e) {
                        throw new BadRequestException("El campo " + f.name() + " debe ser una fecha");
                    }
                }
                case BOOL -> {
                    if (!(raw instanceof Boolean b)) throw new BadRequestException("El campo " + f.name() + " debe ser sí o no");
                    yield b;
                }
                case CHOICE -> {
                    String s = raw.toString();
                    if (!f.options().contains(s)) throw new BadRequestException("Valor no válido para " + f.name());
                    yield s;
                }
            });
        }
        return out;
    }

    /** Hallazgo que requiere acción, o null. */
    static String alert(BiosafetyKind kind, Map<String, Object> d) {
        return switch (kind) {
            case STERILIZATION -> "FAIL".equals(d.get("chemicalIndicator")) ? "Indicador químico no conforme"
                    : "FAIL".equals(d.get("biologicalIndicator")) ? "Indicador biológico no conforme" : null;
            case ENVIRONMENT -> {
                double t = ((Number) d.get("temperature")).doubleValue();
                Object h = d.get("humidity");
                if ("REFRIGERATOR".equals(d.get("place")) && (t < 2 || t > 8)) yield "Nevera fuera de 2–8 °C";
                if (h instanceof Number n && n.doubleValue() > 70) yield "Humedad relativa mayor a 70 %";
                yield null;
            }
            case ACCIDENT -> Boolean.FALSE.equals(d.get("reportedToArl")) ? "Accidente sin reportar a la ARL" : null;
            default -> null;
        };
    }

    private Row find(UUID clinicId, UUID id) {
        return jdbc.query(SELECT + " where clinic_id = ? and id = ?", this::map, clinicId, id).stream().findFirst()
                .orElseThrow(() -> new NotFoundException("Registro no encontrado"));
    }

    private Row map(ResultSet rs, int i) throws SQLException {
        var voided = rs.getTimestamp("voided_at");
        return new Row(rs.getObject("id", UUID.class), rs.getObject("site_id", UUID.class),
                BiosafetyKind.valueOf(rs.getString("kind")), rs.getDate("record_date").toLocalDate(),
                rs.getObject("responsible_id", UUID.class), mapper.readValue(rs.getString("data"), MAP), rs.getString("notes"),
                rs.getObject("created_by", UUID.class), rs.getTimestamp("created_at").toInstant(),
                voided == null ? null : voided.toInstant(), rs.getObject("voided_by", UUID.class), rs.getString("void_reason"));
    }

    private Map<UUID, String> siteNames(List<UUID> ids) {
        return sites.findAllById(ids.stream().filter(Objects::nonNull).collect(Collectors.toSet())).stream()
                .collect(Collectors.toMap(Site::getId, Site::getName));
    }

    private List<RecordResponse> toResponses(List<Row> rows) {
        if (rows.isEmpty()) return List.of();
        var siteNames = siteNames(rows.stream().map(Row::siteId).toList());
        var people = access.userRefs(rows.stream().flatMap(r -> Stream.of(r.responsibleId(), r.createdBy(), r.voidedBy())).toList());
        return rows.stream().map(r -> new RecordResponse(r.id(), new Ref(r.siteId(), siteNames.get(r.siteId())), r.kind(), r.date(),
                people.get(r.responsibleId()), r.data(), r.notes(), people.get(r.createdBy()), r.createdAt(), r.voidedAt(),
                people.get(r.voidedBy()), r.voidReason(), r.voidedAt() == null ? alert(r.kind(), r.data()) : null)).toList();
    }
}
