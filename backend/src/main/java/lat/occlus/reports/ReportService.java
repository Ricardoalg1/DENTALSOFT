package lat.occlus.reports;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lat.occlus.reports.ReportDtos.Appointments;
import lat.occlus.reports.ReportDtos.CategoryTotal;
import lat.occlus.reports.ReportDtos.DayTotal;
import lat.occlus.reports.ReportDtos.Debtor;
import lat.occlus.reports.ReportDtos.MethodTotal;
import lat.occlus.reports.ReportDtos.Patients;
import lat.occlus.reports.ReportDtos.ProcedureTotal;
import lat.occlus.reports.ReportDtos.Production;
import lat.occlus.reports.ReportDtos.ProfessionalAgenda;
import lat.occlus.reports.ReportDtos.ProfessionalTotal;
import lat.occlus.reports.ReportDtos.Receivables;
import lat.occlus.reports.ReportDtos.Report;
import lat.occlus.reports.ReportDtos.Revenue;
import lat.occlus.reports.ReportDtos.SiteTotal;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.Ref;
import lat.occlus.site.SiteRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reportes de gestión. Son agregaciones, así que se escriben en SQL. Todas las consultas filtran por
 * clinic_id (y RLS lo refuerza). Las fechas se interpretan en hora de Colombia.
 */
@Service
@RequiredArgsConstructor
public class ReportService {

    static final ZoneId BOGOTA = ZoneId.of("America/Bogota");
    private static final long MAX_DAYS = 366;

    /** Planes cuyos procedimientos realizados cuentan como producción y como deuda del paciente. */
    private static final String BILLABLE_PLANS = "('ACCEPTED','COMPLETED','CANCELLED')";

    private final JdbcTemplate db;
    private final SiteRepository sites;

    @Transactional(readOnly = true)
    public Report report(UUID clinicId, LocalDate from, LocalDate to, UUID siteId) {
        var range = Range.of(from, to);
        Ref site = null;
        if (siteId != null) {
            site = sites.findById(siteId).filter(s -> s.getClinicId().equals(clinicId))
                    .map(s -> new Ref(s.getId(), s.getName()))
                    .orElseThrow(() -> new BadRequestException("Sede no válida"));
        }
        return new Report(from, to, site, revenue(clinicId, range, siteId), production(clinicId, range),
                appointments(clinicId, range, siteId), patients(clinicId, range, siteId));
    }

    // ---------- Recaudo ----------

    private Revenue revenue(UUID clinicId, Range r, UUID siteId) {
        // Pagos del periodo (por fecha de recibo), con su sede a través de la caja.
        String base = """
                from payment p join cash_session cs on cs.id = p.cash_session_id and cs.clinic_id = p.clinic_id
                where p.clinic_id = ? and p.received_at >= ? and p.received_at < ?""" + (siteId == null ? "" : " and cs.site_id = ?");
        Object[] args = args(clinicId, r, siteId);

        var totals = db.queryForMap("""
                select coalesce(sum(p.amount) filter (where p.voided_at is null), 0) as total,
                       count(*) filter (where p.voided_at is null) as count,
                       coalesce(sum(p.amount) filter (where p.voided_at is not null), 0) as voided_total,
                       count(*) filter (where p.voided_at is not null) as voided_count
                """ + base, args);

        var byMethod = db.query("select p.method, count(*) as n, sum(p.amount) as total " + base
                        + " and p.voided_at is null group by p.method order by total desc",
                (rs, i) -> new MethodTotal(rs.getString("method"), rs.getLong("n"), rs.getBigDecimal("total")), args);

        Map<LocalDate, BigDecimal> perDay = new LinkedHashMap<>();
        for (LocalDate d = r.from(); !d.isAfter(r.to()); d = d.plusDays(1)) perDay.put(d, BigDecimal.ZERO);
        db.query("select (p.received_at at time zone 'America/Bogota')::date as day, sum(p.amount) as total " + base
                        + " and p.voided_at is null group by day",
                rs -> {
                    perDay.put(rs.getObject("day", LocalDate.class), rs.getBigDecimal("total"));
                }, args);
        var byDay = perDay.entrySet().stream().map(e -> new DayTotal(e.getKey(), e.getValue())).toList();

        var bySite = db.query("select s.id, s.name, sum(p.amount) as total " + base.replace(
                        "where p.clinic_id", "join site s on s.id = cs.site_id where p.clinic_id")
                        + " and p.voided_at is null group by s.id, s.name order by total desc",
                (rs, i) -> new SiteTotal(new Ref(rs.getObject("id", UUID.class), rs.getString("name")),
                        rs.getBigDecimal("total")), args);

        return new Revenue((BigDecimal) totals.get("total"), ((Number) totals.get("count")).longValue(),
                (BigDecimal) totals.get("voided_total"), ((Number) totals.get("voided_count")).longValue(),
                byMethod, byDay, bySite);
    }

    // ---------- Producción ----------

    private Production production(UUID clinicId, Range r) {
        // Procedimientos marcados como realizados en el periodo (por fecha de realización).
        String base = """
                from treatment_item i join treatment_plan pl on pl.id = i.plan_id and pl.clinic_id = i.clinic_id
                where i.clinic_id = ? and i.status = 'DONE' and i.done_at >= ? and i.done_at < ?
                  and pl.status in """ + BILLABLE_PLANS;
        Object[] args = args(clinicId, r, null);
        String value = "(i.unit_price * i.quantity - i.discount)";

        var totals = db.queryForMap("select coalesce(sum(" + value + "), 0) as total, count(*) as n " + base, args);

        var byProfessional = db.query("select u.id, u.full_name, count(*) as n, sum(" + value + ") as total "
                        + base.replace("where i.clinic_id", "join app_user u on u.id = i.done_by where i.clinic_id")
                        + " group by u.id, u.full_name order by total desc",
                (rs, i) -> new ProfessionalTotal(new Ref(rs.getObject("id", UUID.class), rs.getString("full_name")),
                        rs.getLong("n"), rs.getBigDecimal("total")), args);

        var byCategory = db.query("select sc.category, count(*) as n, sum(" + value + ") as total "
                        + base.replace("where i.clinic_id", "join service_catalog sc on sc.id = i.service_id where i.clinic_id")
                        + " group by sc.category order by total desc",
                (rs, i) -> new CategoryTotal(rs.getString("category"), rs.getLong("n"), rs.getBigDecimal("total")), args);

        var top = db.query("select i.description, sum(i.quantity) as n, sum(" + value + ") as total " + base
                        + " group by i.description order by total desc, n desc limit 10",
                (rs, i) -> new ProcedureTotal(rs.getString("description"), rs.getLong("n"), rs.getBigDecimal("total")), args);

        return new Production((BigDecimal) totals.get("total"), ((Number) totals.get("n")).longValue(),
                byProfessional, byCategory, top);
    }

    // ---------- Agenda ----------

    private Appointments appointments(UUID clinicId, Range r, UUID siteId) {
        String base = "from appointment a where a.clinic_id = ? and a.starts_at >= ? and a.starts_at < ?"
                + (siteId == null ? "" : " and a.site_id = ?");
        Object[] args = args(clinicId, r, siteId);

        Map<String, Long> byStatus = new LinkedHashMap<>();
        for (String s : List.of("SCHEDULED", "CONFIRMED", "ATTENDED", "NO_SHOW", "CANCELLED")) byStatus.put(s, 0L);
        db.query("select a.status, count(*) as n " + base + " group by a.status",
                rs -> {
                    byStatus.put(rs.getString("status"), rs.getLong("n"));
                }, args);
        long total = byStatus.values().stream().mapToLong(Long::longValue).sum();
        long attended = byStatus.get("ATTENDED");
        long noShow = byStatus.get("NO_SHOW");
        long resolved = attended + noShow;

        var byProfessional = db.query("""
                        select u.id, u.full_name, count(*) as n,
                               count(*) filter (where a.status = 'ATTENDED') as attended,
                               count(*) filter (where a.status = 'NO_SHOW') as no_show,
                               count(*) filter (where a.status = 'CANCELLED') as cancelled
                        """ + base.replace("where a.clinic_id", "join app_user u on u.id = a.dentist_id where a.clinic_id")
                        + " group by u.id, u.full_name order by n desc",
                (rs, i) -> new ProfessionalAgenda(new Ref(rs.getObject("id", UUID.class), rs.getString("full_name")),
                        rs.getLong("n"), rs.getLong("attended"), rs.getLong("no_show"), rs.getLong("cancelled")), args);

        return new Appointments(total, byStatus,
                resolved == 0 ? null : (double) attended / resolved,
                resolved == 0 ? null : (double) noShow / resolved,
                byProfessional);
    }

    // ---------- Pacientes ----------

    private Patients patients(UUID clinicId, Range r, UUID siteId) {
        Long created = db.queryForObject(
                "select count(*) from patient where clinic_id = ? and created_at >= ? and created_at < ?",
                Long.class, clinicId, r.start(), r.end());
        Long attended = db.queryForObject("""
                select count(distinct a.patient_id) from appointment a
                where a.clinic_id = ? and a.starts_at >= ? and a.starts_at < ? and a.status = 'ATTENDED'"""
                + (siteId == null ? "" : " and a.site_id = ?"), Long.class, args(clinicId, r, siteId));
        return new Patients(created == null ? 0 : created, attended == null ? 0 : attended);
    }

    // ---------- Cartera ----------

    /** Pacientes que deben (realizado − pagado > 0), de mayor a menor saldo, y el total de anticipos. */
    @Transactional(readOnly = true)
    public Receivables receivables(UUID clinicId) {
        String balances = """
                with done as (
                    select pl.patient_id, sum(i.unit_price * i.quantity - i.discount) as v
                    from treatment_item i join treatment_plan pl on pl.id = i.plan_id and pl.clinic_id = i.clinic_id
                    where i.clinic_id = ? and i.status = 'DONE' and pl.status in %s
                    group by pl.patient_id),
                paid as (
                    select patient_id, sum(amount) as v, max(received_at) as last_at
                    from payment where clinic_id = ? and voided_at is null group by patient_id),
                balances as (
                    select pt.id, pt.first_name, pt.middle_name, pt.first_last_name, pt.second_last_name,
                           pt.document_type, pt.document_number, pt.phone,
                           coalesce(d.v, 0) as done, coalesce(pd.v, 0) as paid, pd.last_at,
                           coalesce(d.v, 0) - coalesce(pd.v, 0) as balance
                    from patient pt
                    left join done d on d.patient_id = pt.id
                    left join paid pd on pd.patient_id = pt.id
                    where pt.clinic_id = ?)
                """.formatted(BILLABLE_PLANS);

        var totals = db.queryForMap(balances + """
                select coalesce(sum(balance) filter (where balance > 0), 0) as owed,
                       count(*) filter (where balance > 0) as debtors,
                       coalesce(-sum(balance) filter (where balance < 0), 0) as advances
                from balances""", clinicId, clinicId, clinicId);

        var debtors = db.query(balances + " select * from balances where balance > 0 order by balance desc limit 100",
                (rs, i) -> {
                    var last = rs.getTimestamp("last_at");
                    return new Debtor(rs.getObject("id", UUID.class),
                            String.join(" ", nonBlank(rs.getString("first_name"), rs.getString("middle_name"),
                                    rs.getString("first_last_name"), rs.getString("second_last_name"))),
                            rs.getString("document_type") + " " + rs.getString("document_number"),
                            rs.getString("phone"), rs.getBigDecimal("done"), rs.getBigDecimal("paid"),
                            rs.getBigDecimal("balance"), last == null ? null : last.toInstant());
                }, clinicId, clinicId, clinicId);

        return new Receivables((BigDecimal) totals.get("owed"), ((Number) totals.get("debtors")).longValue(),
                (BigDecimal) totals.get("advances"), debtors);
    }

    // ---------- Exportación ----------

    /** Pagos del periodo en CSV (separador ";" y BOM UTF-8 para que Excel en español lo abra bien). */
    @Transactional(readOnly = true)
    public String paymentsCsv(UUID clinicId, LocalDate from, LocalDate to) {
        var r = Range.of(from, to);
        var out = new StringBuilder("﻿");
        out.append("Recibo;Fecha;Paciente;Documento;Valor;Medio;Referencia;Sede;Recibió;Estado;Motivo anulación\r\n");
        db.query("""
                select p.receipt_number, p.received_at, p.amount, p.method, p.reference, p.voided_at, p.void_reason,
                       pt.first_name, pt.middle_name, pt.first_last_name, pt.second_last_name,
                       pt.document_type, pt.document_number, s.name as site, u.full_name as received_by
                from payment p
                join patient pt on pt.id = p.patient_id
                join cash_session cs on cs.id = p.cash_session_id
                join site s on s.id = cs.site_id
                join app_user u on u.id = p.received_by
                where p.clinic_id = ? and p.received_at >= ? and p.received_at < ?
                order by p.receipt_number""", rs -> {
            var when = rs.getTimestamp("received_at").toInstant().atZone(BOGOTA);
            out.append(String.join(";",
                    csv(String.format("%06d", rs.getLong("receipt_number"))),
                    csv(when.toLocalDate() + " " + when.toLocalTime().truncatedTo(ChronoUnit.MINUTES)),
                    csv(String.join(" ", nonBlank(rs.getString("first_name"), rs.getString("middle_name"),
                            rs.getString("first_last_name"), rs.getString("second_last_name")))),
                    csv(rs.getString("document_type") + " " + rs.getString("document_number")),
                    // Coma decimal, como lo espera Excel configurado en español.
                    csv(rs.getBigDecimal("amount").stripTrailingZeros().toPlainString().replace('.', ',')),
                    csv(rs.getString("method")),
                    csv(rs.getString("reference")),
                    csv(rs.getString("site")),
                    csv(rs.getString("received_by")),
                    csv(rs.getTimestamp("voided_at") == null ? "Vigente" : "Anulado"),
                    csv(rs.getString("void_reason")))).append("\r\n");
        }, clinicId, r.start(), r.end());
        return out.toString();
    }

    // ---------- Apoyo ----------

    /** Periodo [from, to] en días de Colombia → [inicio, fin) como instantes. */
    record Range(LocalDate from, LocalDate to, OffsetDateTime start, OffsetDateTime end) {
        static Range of(LocalDate from, LocalDate to) {
            if (from == null || to == null || to.isBefore(from)) throw new BadRequestException("Rango de fechas inválido");
            if (ChronoUnit.DAYS.between(from, to) >= MAX_DAYS) throw new BadRequestException("El periodo máximo es de un año");
            return new Range(from, to, from.atStartOfDay(BOGOTA).toOffsetDateTime(),
                    to.plusDays(1).atStartOfDay(BOGOTA).toOffsetDateTime());
        }
    }

    private static Object[] args(UUID clinicId, Range r, UUID siteId) {
        var list = new ArrayList<Object>(List.of(clinicId, Timestamp.from(r.start().toInstant()), Timestamp.from(r.end().toInstant())));
        if (siteId != null) list.add(siteId);
        return list.toArray();
    }

    private static List<String> nonBlank(String... parts) {
        var out = new ArrayList<String>();
        for (String p : parts) if (p != null && !p.isBlank()) out.add(p);
        return out;
    }

    /** Campo CSV: entre comillas si hace falta; evita fórmulas al abrir en Excel (inyección CSV). */
    static String csv(String value) {
        if (value == null) return "";
        String v = value;
        if (!v.isEmpty() && "=+-@".indexOf(v.charAt(0)) >= 0) v = "'" + v;
        boolean quote = v.contains(";") || v.contains("\"") || v.contains("\n") || v.contains("\r");
        return quote ? "\"" + v.replace("\"", "\"\"") + "\"" : v;
    }
}
