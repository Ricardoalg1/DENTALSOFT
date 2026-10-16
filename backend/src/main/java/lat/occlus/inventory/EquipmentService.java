package lat.occlus.inventory;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import lat.occlus.inventory.InventoryDtos.Equipment;
import lat.occlus.inventory.InventoryDtos.EquipmentKind;
import lat.occlus.inventory.InventoryDtos.EquipmentRequest;
import lat.occlus.inventory.InventoryDtos.EquipmentStatus;
import lat.occlus.inventory.InventoryDtos.RiskClass;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.ConflictException;
import lat.occlus.shared.web.NotFoundException;
import lat.occlus.shared.web.PageResponse;
import lat.occlus.shared.web.Ref;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Equipos de la clínica (biomédicos y generales) con su hoja de vida. El último y el próximo mantenimiento salen
 * de los registros de Bioseguridad → Mantenimiento ligados al equipo (si el registro no trae próxima fecha, se
 * calcula con la periodicidad del equipo).
 */
@Service
@RequiredArgsConstructor
public class EquipmentService {

    private static final String SELECT = """
            select e.*, s.name as site_name, m.last_date, m.next_due
            from equipment e
            join site s on s.id = e.site_id
            left join lateral (
                select r.record_date as last_date, nullif(r.data->>'nextDue', '')::date as next_due
                from biosafety_record r
                where r.clinic_id = e.clinic_id and r.kind = 'MAINTENANCE' and r.voided_at is null
                  and r.data->>'equipmentId' = e.id::text
                order by r.record_date desc, r.created_at desc limit 1) m on true
            """;

    private final JdbcTemplate db;

    /** {@code status} null = todos menos los dados de baja; {@code query} busca en código, nombre, marca, serie. */
    @Transactional(readOnly = true)
    public PageResponse<Equipment> search(UUID clinicId, String query, EquipmentKind kind, EquipmentStatus status,
                                          UUID siteId, boolean includeRetired, int page, int size) {
        if (page < 0 || size < 1 || size > 100 || (query != null && query.length() > 120)) throw new BadRequestException("Filtros inválidos");
        var where = new StringBuilder(" where e.clinic_id = ?");
        var args = new ArrayList<Object>(List.of(clinicId));
        if (kind != null) { where.append(" and e.kind = ?"); args.add(kind.name()); }
        if (status != null) { where.append(" and e.status = ?"); args.add(status.name()); }
        else if (!includeRetired) where.append(" and e.status <> 'RETIRED'");
        if (siteId != null) { where.append(" and e.site_id = ?"); args.add(siteId); }
        if (query != null && !query.isBlank()) {
            where.append(" and concat_ws(' ', e.code, e.name, e.brand, e.model, e.serial, e.invima_registry, e.location) ilike ? escape '!'");
            args.add("%" + query.trim().replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%");
        }
        long count = db.queryForObject("select count(*) from equipment e" + where, Long.class, args.toArray());
        int pages = (int) Math.ceil((double) count / size);
        int actual = pages == 0 ? 0 : Math.min(page, pages - 1);
        args.add(size);
        args.add(actual * size);
        var rows = db.query(SELECT + where + " order by lower(e.name), e.code limit ? offset ?", this::map, args.toArray());
        return new PageResponse<>(rows, actual, size, count, pages);
    }

    /** Lista corta para elegir el equipo de un mantenimiento (sin los dados de baja). */
    @Transactional(readOnly = true)
    public List<Equipment> options(UUID clinicId) {
        return db.query(SELECT + " where e.clinic_id = ? and e.status <> 'RETIRED' order by lower(e.name)", this::map, clinicId);
    }

    @Transactional(readOnly = true)
    public Equipment get(UUID clinicId, UUID id) {
        return db.query(SELECT + " where e.clinic_id = ? and e.id = ?", this::map, clinicId, id).stream().findFirst()
                .orElseThrow(() -> new NotFoundException("Equipo no encontrado"));
    }

    @Transactional
    public Equipment save(UUID clinicId, UUID id, EquipmentRequest r) {
        if (!Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from site where id = ? and clinic_id = ?)", Boolean.class, r.siteId(), clinicId))) {
            throw new BadRequestException("Sede no válida");
        }
        String code = r.code().trim().toUpperCase(Locale.ROOT);
        if (!db.queryForList("select id from equipment where clinic_id = ? and code = ? and id <> ?", UUID.class, clinicId, code,
                id == null ? UUID.randomUUID() : id).isEmpty()) {
            throw new ConflictException("Ya existe un equipo con ese código");
        }
        if (r.kind() == EquipmentKind.GENERAL && r.riskClass() != null) {
            throw new BadRequestException("La clase de riesgo aplica solo a equipos biomédicos");
        }
        Object[] values = {r.siteId(), code, r.name().trim(), r.kind().name(), clean(r.brand()), clean(r.model()), clean(r.serial()),
                clean(r.invimaRegistry()), r.riskClass() == null ? null : r.riskClass().name(), clean(r.location()), r.acquiredOn(),
                r.cost(), r.warrantyUntil(), r.maintenanceMonths(), (r.status() == null ? EquipmentStatus.ACTIVE : r.status()).name(),
                clean(r.notes())};
        if (id == null) {
            id = UUID.randomUUID();
            var args = new ArrayList<Object>(List.of(id, clinicId));
            args.addAll(java.util.Arrays.asList(values));
            db.update("""
                    insert into equipment (id, clinic_id, site_id, code, name, kind, brand, model, serial, invima_registry, risk_class,
                                           location, acquired_on, cost, warranty_until, maintenance_months, status, notes)
                    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""", args.toArray());
        } else {
            get(clinicId, id);
            var args = new ArrayList<Object>(java.util.Arrays.asList(values));
            args.add(id);
            args.add(clinicId);
            db.update("""
                    update equipment set site_id = ?, code = ?, name = ?, kind = ?, brand = ?, model = ?, serial = ?, invima_registry = ?,
                           risk_class = ?, location = ?, acquired_on = ?, cost = ?, warranty_until = ?, maintenance_months = ?, status = ?,
                           notes = ?, updated_at = now()
                    where id = ? and clinic_id = ?""", args.toArray());
        }
        return get(clinicId, id);
    }

    private Equipment map(ResultSet rs, int i) throws SQLException {
        LocalDate last = rs.getObject("last_date", LocalDate.class);
        LocalDate next = rs.getObject("next_due", LocalDate.class);
        Integer months = (Integer) rs.getObject("maintenance_months", Integer.class);
        if (next == null && last != null && months != null) next = last.plusMonths(months);
        String risk = rs.getString("risk_class");
        return new Equipment(rs.getObject("id", UUID.class), new Ref(rs.getObject("site_id", UUID.class), rs.getString("site_name")),
                rs.getString("code"), rs.getString("name"), EquipmentKind.valueOf(rs.getString("kind")), rs.getString("brand"),
                rs.getString("model"), rs.getString("serial"), rs.getString("invima_registry"),
                risk == null ? null : RiskClass.valueOf(risk), rs.getString("location"), rs.getObject("acquired_on", LocalDate.class),
                rs.getBigDecimal("cost"), rs.getObject("warranty_until", LocalDate.class), months,
                EquipmentStatus.valueOf(rs.getString("status")), rs.getString("notes"), last, next,
                rs.getTimestamp("updated_at").toInstant());
    }

    private static String clean(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
