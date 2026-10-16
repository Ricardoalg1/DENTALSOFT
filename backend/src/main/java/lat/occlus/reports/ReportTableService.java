package lat.occlus.reports;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lat.occlus.cash.CashDtos.FinancingStatus;
import lat.occlus.cash.FinancingService;
import lat.occlus.reports.ReportDtos.Column;
import lat.occlus.reports.ReportDtos.ColumnType;
import lat.occlus.reports.ReportDtos.TableReport;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Centro de informes: informes tabulares (con total y exportación CSV) calculados sobre los datos de la clínica.
 * Cada informe declara sus columnas; las filas son mapas columna → valor.
 */
@Service
@RequiredArgsConstructor
public class ReportTableService {

    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");
    private static final String PATIENT_NAME =
            "concat_ws(' ', pt.first_name, pt.middle_name, pt.first_last_name, pt.second_last_name)";
    private static final String PATIENT_DOC = "pt.document_type || ' ' || pt.document_number";
    private static final int MAX_ROWS = 5000;

    private static final Map<String, String> METHODS = Map.of("CASH", "Efectivo", "DEBIT_CARD", "Tarjeta débito",
            "CREDIT_CARD", "Tarjeta crédito", "TRANSFER", "Transferencia", "OTHER", "Otro");
    private static final Map<String, String> KINDS = Map.of("SALE", "Recibo", "ACCOUNT", "Abono a cuenta");
    private static final Map<String, String> EXPENSE_CATEGORIES = Map.ofEntries(
            Map.entry("SUPPLIES", "Insumos y materiales"), Map.entry("LAB", "Laboratorio dental"),
            Map.entry("PAYROLL", "Nómina y honorarios"), Map.entry("RENT", "Arriendo"),
            Map.entry("UTILITIES", "Servicios públicos"), Map.entry("MAINTENANCE", "Mantenimiento"),
            Map.entry("EQUIPMENT", "Equipos"), Map.entry("MARKETING", "Publicidad"), Map.entry("TAXES", "Impuestos"),
            Map.entry("BIOSAFETY", "Bioseguridad"), Map.entry("OTHER", "Otros"));
    private static final Map<String, String> PLAN_STATUS = Map.of("DRAFT", "Sin aceptar", "ACCEPTED", "Aceptado");
    private static final Map<String, String> APPOINTMENT_STATUS = Map.of("SCHEDULED", "Agendada", "CONFIRMED", "Confirmada",
            "ATTENDED", "Atendida", "NO_SHOW", "No asistió", "CANCELLED", "Cancelada");
    private static final Map<String, String> WASTE = Map.of("BIOSANITARY", "Biosanitarios", "SHARPS", "Cortopunzantes",
            "ANATOMOPATHOLOGICAL", "Anatomopatológicos", "CHEMICAL", "Químicos", "AMALGAM", "Amalgama / mercurio",
            "RECYCLABLE", "Reciclables", "ORDINARY", "Ordinarios");
    private static final Map<String, String> MOVEMENTS = Map.of("ENTRY", "Entrada", "CONSUMPTION", "Consumo",
            "DISCARD", "Descarte", "ADJUSTMENT", "Ajuste", "TRANSFER_OUT", "Traslado (salida)", "TRANSFER_IN", "Traslado (entrada)");
    private static final Map<String, String> INVOICE_STATUS = Map.of("DRAFT", "Borrador", "PREPARED", "Preparada", "CANCELLED", "Anulada");

    private final JdbcTemplate db;
    private final ReportService reports;
    private final FinancingService financings;

    @Transactional(readOnly = true)
    public TableReport table(UUID clinicId, String key, LocalDate from, LocalDate to, UUID siteId) {
        if (from.isAfter(to)) throw new BadRequestException("La fecha inicial es posterior a la final");
        if (from.plusYears(5).isBefore(to)) throw new BadRequestException("El rango máximo es de 5 años");
        return switch (key) {
            case "ingresos" -> income(clinicId, from, to, siteId);
            case "gastos" -> expenses(clinicId, from, to, siteId);
            case "cuadre-caja" -> cashClosing(clinicId, from, to, siteId);
            case "cartera" -> receivables(clinicId);
            case "anulaciones" -> voids(clinicId, from, to);
            case "presupuestos-pendientes" -> pendingBudgets(clinicId, from, to);
            case "citas" -> appointments(clinicId, from, to, siteId);
            case "archivo-gestion" -> archive(clinicId, true);
            case "archivo-historico" -> archive(clinicId, false);
            case "cumpleanos" -> birthdays(clinicId, from, to);
            case "residuos" -> waste(clinicId, from, to, siteId);
            case "inventarios" -> stock(clinicId, siteId);
            case "movimientos-inventario" -> movements(clinicId, from, to, siteId);
            case "actividades" -> activities(clinicId, from, to);
            case "oportunidad-citas" -> opportunity(clinicId, from, to, siteId);
            case "cop" -> cop(clinicId);
            case "fev-rips" -> invoices(clinicId, from, to);
            default -> throw new NotFoundException("Informe no disponible");
        };
    }

    /** CSV con separador ";" y BOM UTF-8 (Excel en español). */
    public String csv(TableReport report) {
        var out = new StringBuilder("﻿");
        out.append(String.join(";", report.columns().stream().map(c -> csvCell(c.label())).toList())).append("\r\n");
        for (var row : report.rows()) {
            out.append(String.join(";", report.columns().stream().map(c -> csvCell(row.get(c.key()))).toList())).append("\r\n");
        }
        return out.toString();
    }

    // ---------- Financieros ----------

    private TableReport income(UUID clinicId, LocalDate from, LocalDate to, UUID siteId) {
        var cols = List.of(col("fecha", "Fecha", ColumnType.DATE), col("recibo", "Recibo", ColumnType.TEXT),
                col("paciente", "Paciente", ColumnType.TEXT), col("documento", "Documento", ColumnType.TEXT),
                col("tipo", "Tipo", ColumnType.TEXT), col("concepto", "Concepto", ColumnType.TEXT),
                col("sede", "Sede", ColumnType.TEXT), col("doctor", "Doctor", ColumnType.TEXT),
                col("medio", "Medio", ColumnType.TEXT), col("valor", "Valor", ColumnType.MONEY),
                col("estado", "Estado", ColumnType.TEXT));
        var args = new ArrayList<Object>(List.of(clinicId, from, to));
        String site = siteFilter("cs.site_id", siteId, args);
        var rows = db.query("""
                select p.income_date, p.receipt_number, %s as patient, %s as doc, p.kind, p.concept, s.name as site,
                       u.full_name as dentist, p.method, p.amount, p.voided_at
                from payment p
                join patient pt on pt.id = p.patient_id
                join cash_session cs on cs.id = p.cash_session_id
                join site s on s.id = cs.site_id
                left join app_user u on u.id = p.dentist_id
                where p.clinic_id = ? and p.income_date between ? and ? %s
                order by p.income_date, p.receipt_number""".formatted(PATIENT_NAME, PATIENT_DOC, site),
                (rs, i) -> row("fecha", rs.getDate("income_date").toLocalDate(),
                        "recibo", String.format("%06d", rs.getLong("receipt_number")), "paciente", rs.getString("patient"),
                        "documento", rs.getString("doc"), "tipo", KINDS.get(rs.getString("kind")),
                        "concepto", rs.getString("concept"), "sede", rs.getString("site"), "doctor", rs.getString("dentist"),
                        "medio", METHODS.get(rs.getString("method")), "valor", rs.getBigDecimal("amount"),
                        "estado", rs.getTimestamp("voided_at") == null ? "Vigente" : "Anulado"), args.toArray());
        return report("ingresos", "Ingresos", "Recibos y abonos del periodo por fecha del ingreso. El total excluye los anulados.",
                cols, rows, Map.of("valor", sum(rows, "valor", r -> "Vigente".equals(r.get("estado")))));
    }

    private TableReport expenses(UUID clinicId, LocalDate from, LocalDate to, UUID siteId) {
        var cols = List.of(col("fecha", "Fecha", ColumnType.DATE), col("categoria", "Categoría", ColumnType.TEXT),
                col("descripcion", "Descripción", ColumnType.TEXT), col("proveedor", "Proveedor", ColumnType.TEXT),
                col("factura", "Factura", ColumnType.TEXT), col("sede", "Sede", ColumnType.TEXT),
                col("medio", "Medio", ColumnType.TEXT), col("valor", "Valor", ColumnType.MONEY),
                col("estado", "Estado", ColumnType.TEXT));
        var args = new ArrayList<Object>(List.of(clinicId, from, to));
        String site = siteFilter("e.site_id", siteId, args);
        var rows = db.query("""
                select e.expense_date, e.category, e.description, e.supplier_name, e.invoice_number, s.name as site,
                       e.method, e.amount, e.voided_at, e.cash_session_id
                from expense e join site s on s.id = e.site_id
                where e.clinic_id = ? and e.expense_date between ? and ? %s
                order by e.expense_date, e.created_at""".formatted(site),
                (rs, i) -> row("fecha", rs.getDate("expense_date").toLocalDate(),
                        "categoria", EXPENSE_CATEGORIES.get(rs.getString("category")), "descripcion", rs.getString("description"),
                        "proveedor", rs.getString("supplier_name"), "factura", rs.getString("invoice_number"),
                        "sede", rs.getString("site"),
                        "medio", METHODS.get(rs.getString("method")) + (rs.getObject("cash_session_id") == null ? "" : " (caja)"),
                        "valor", rs.getBigDecimal("amount"), "estado", rs.getTimestamp("voided_at") == null ? "Vigente" : "Anulado"),
                args.toArray());
        return report("gastos", "Gastos", "Egresos del periodo. El total excluye los anulados.", cols, rows,
                Map.of("valor", sum(rows, "valor", r -> "Vigente".equals(r.get("estado")))));
    }

    private TableReport cashClosing(UUID clinicId, LocalDate from, LocalDate to, UUID siteId) {
        var cols = List.of(col("sede", "Sede", ColumnType.TEXT), col("apertura", "Apertura", ColumnType.DATETIME),
                col("cierre", "Cierre", ColumnType.DATETIME), col("abrio", "Abrió", ColumnType.TEXT),
                col("base", "Base", ColumnType.MONEY), col("efectivo", "Efectivo recibido", ColumnType.MONEY),
                col("gastos", "Gastos de caja", ColumnType.MONEY), col("esperado", "Esperado", ColumnType.MONEY),
                col("contado", "Contado", ColumnType.MONEY), col("diferencia", "Diferencia", ColumnType.MONEY),
                col("recaudado", "Recaudado (todos los medios)", ColumnType.MONEY));
        var args = new ArrayList<Object>(List.of(clinicId, from, to));
        String site = siteFilter("cs.site_id", siteId, args);
        var rows = db.query("""
                select s.name as site, cs.opened_at, cs.closed_at, u.full_name as opened_by, cs.opening_amount,
                       cs.expected_cash, cs.counted_cash,
                       (select coalesce(sum(p.amount), 0) from payment p where p.cash_session_id = cs.id and p.voided_at is null and p.method = 'CASH') as cash_in,
                       (select coalesce(sum(p.amount), 0) from payment p where p.cash_session_id = cs.id and p.voided_at is null) as collected,
                       (select coalesce(sum(e.amount), 0) from expense e where e.cash_session_id = cs.id and e.voided_at is null) as cash_out
                from cash_session cs join site s on s.id = cs.site_id left join app_user u on u.id = cs.opened_by
                where cs.clinic_id = ? and (cs.opened_at at time zone 'America/Bogota')::date between ? and ? %s
                order by cs.opened_at""".formatted(site),
                (rs, i) -> {
                    BigDecimal base = rs.getBigDecimal("opening_amount");
                    BigDecimal expected = rs.getTimestamp("closed_at") == null
                            ? base.add(rs.getBigDecimal("cash_in")).subtract(rs.getBigDecimal("cash_out"))
                            : rs.getBigDecimal("expected_cash");
                    BigDecimal counted = rs.getBigDecimal("counted_cash");
                    return row("sede", rs.getString("site"), "apertura", rs.getTimestamp("opened_at").toInstant(),
                            "cierre", rs.getTimestamp("closed_at") == null ? null : rs.getTimestamp("closed_at").toInstant(),
                            "abrio", rs.getString("opened_by"), "base", base, "efectivo", rs.getBigDecimal("cash_in"),
                            "gastos", rs.getBigDecimal("cash_out"), "esperado", expected, "contado", counted,
                            "diferencia", counted == null ? null : counted.subtract(expected), "recaudado", rs.getBigDecimal("collected"));
                }, args.toArray());
        return report("cuadre-caja", "Cuadre de caja", "Turnos abiertos en el periodo: esperado = base + efectivo − gastos de caja; diferencia = contado − esperado.",
                cols, rows, Map.of("efectivo", sum(rows, "efectivo", r -> true), "gastos", sum(rows, "gastos", r -> true),
                        "diferencia", sum(rows, "diferencia", r -> true), "recaudado", sum(rows, "recaudado", r -> true)));
    }

    private TableReport receivables(UUID clinicId) {
        var cols = List.of(col("paciente", "Paciente", ColumnType.TEXT), col("documento", "Documento", ColumnType.TEXT),
                col("telefono", "Teléfono", ColumnType.TEXT), col("realizado", "Realizado", ColumnType.MONEY),
                col("pagado", "Pagado", ColumnType.MONEY), col("saldo", "Saldo", ColumnType.MONEY),
                col("mora", "Cuotas vencidas", ColumnType.MONEY), col("ultimoPago", "Último pago", ColumnType.DATETIME));
        Map<UUID, BigDecimal> overdue = new HashMap<>();
        financings.list(clinicId, FinancingStatus.OVERDUE, null)
                .forEach(f -> overdue.merge(f.patient().id(), f.overdue(), BigDecimal::add));
        var rows = reports.receivables(clinicId).debtors().stream().map(d -> row("paciente", d.fullName(), "documento", d.document(),
                "telefono", d.phone(), "realizado", d.done(), "pagado", d.paid(), "saldo", d.balance(),
                "mora", overdue.getOrDefault(d.patientId(), BigDecimal.ZERO), "ultimoPago", d.lastPaymentAt())).toList();
        return report("cartera", "Cartera", "Pacientes que deben (realizado en sus planes − abonos), con lo vencido de sus financiamientos. Estado a hoy.",
                cols, rows, Map.of("saldo", sum(rows, "saldo", r -> true), "mora", sum(rows, "mora", r -> true)));
    }

    private TableReport voids(UUID clinicId, LocalDate from, LocalDate to) {
        var cols = List.of(col("anulado", "Anulado", ColumnType.DATETIME), col("tipo", "Tipo", ColumnType.TEXT),
                col("documento", "Recibo / gasto", ColumnType.TEXT), col("detalle", "Paciente / descripción", ColumnType.TEXT),
                col("valor", "Valor", ColumnType.MONEY), col("motivo", "Motivo", ColumnType.TEXT), col("anulo", "Anuló", ColumnType.TEXT));
        var rows = db.query("""
                select * from (
                    select p.voided_at, 'Ingreso' as kind, lpad(p.receipt_number::text, 6, '0') as doc, %s as detail,
                           p.amount, p.void_reason, u.full_name as who
                    from payment p join patient pt on pt.id = p.patient_id left join app_user u on u.id = p.voided_by
                    where p.clinic_id = ? and p.voided_at is not null
                    union all
                    select e.voided_at, 'Gasto', e.invoice_number, e.description, e.amount, e.void_reason, u.full_name
                    from expense e left join app_user u on u.id = e.voided_by
                    where e.clinic_id = ? and e.voided_at is not null) v
                where (voided_at at time zone 'America/Bogota')::date between ? and ?
                order by voided_at""".formatted(PATIENT_NAME),
                (rs, i) -> row("anulado", rs.getTimestamp("voided_at").toInstant(), "tipo", rs.getString("kind"),
                        "documento", rs.getString("doc"), "detalle", rs.getString("detail"), "valor", rs.getBigDecimal("amount"),
                        "motivo", rs.getString("void_reason"), "anulo", rs.getString("who")),
                clinicId, clinicId, from, to);
        return report("anulaciones", "Anulaciones", "Ingresos y gastos anulados en el periodo, con motivo y responsable.",
                cols, rows, Map.of("valor", sum(rows, "valor", r -> true)));
    }

    private TableReport pendingBudgets(UUID clinicId, LocalDate from, LocalDate to) {
        var cols = List.of(col("creado", "Creado", ColumnType.DATE), col("paciente", "Paciente", ColumnType.TEXT),
                col("telefono", "Teléfono", ColumnType.TEXT), col("plan", "Plan", ColumnType.TEXT),
                col("estado", "Estado", ColumnType.TEXT), col("profesional", "Profesional", ColumnType.TEXT),
                col("presupuestado", "Presupuestado", ColumnType.MONEY), col("pendiente", "Pendiente por realizar", ColumnType.MONEY));
        var rows = db.query("""
                select pl.created_at, %s as patient, pt.phone, pl.title, pl.status, u.full_name as dentist,
                       coalesce(sum(i.unit_price * i.quantity - i.discount) filter (where i.status <> 'CANCELLED'), 0) as budget,
                       coalesce(sum(i.unit_price * i.quantity - i.discount) filter (where i.status = 'PENDING'), 0) as pending
                from treatment_plan pl
                join patient pt on pt.id = pl.patient_id
                join app_user u on u.id = pl.dentist_id
                left join treatment_item i on i.plan_id = pl.id
                where pl.clinic_id = ? and pl.status in ('DRAFT', 'ACCEPTED')
                  and (pl.created_at at time zone 'America/Bogota')::date between ? and ?
                group by pl.id, pt.id, u.full_name
                having pl.status = 'DRAFT' or coalesce(sum(i.unit_price * i.quantity - i.discount) filter (where i.status = 'PENDING'), 0) > 0
                order by pl.created_at""".formatted(PATIENT_NAME),
                (rs, i) -> row("creado", rs.getTimestamp("created_at").toInstant().atZone(BOGOTA).toLocalDate(),
                        "paciente", rs.getString("patient"), "telefono", rs.getString("phone"), "plan", rs.getString("title"),
                        "estado", PLAN_STATUS.get(rs.getString("status")), "profesional", rs.getString("dentist"),
                        "presupuestado", rs.getBigDecimal("budget"), "pendiente", rs.getBigDecimal("pending")),
                clinicId, from, to);
        return report("presupuestos-pendientes", "Presupuestos pendientes",
                "Presupuestos creados en el periodo sin aceptar, o aceptados con procedimientos pendientes por realizar.",
                cols, rows, Map.of("presupuestado", sum(rows, "presupuestado", r -> true), "pendiente", sum(rows, "pendiente", r -> true)));
    }

    // ---------- Operativos ----------

    private TableReport appointments(UUID clinicId, LocalDate from, LocalDate to, UUID siteId) {
        var cols = List.of(col("fecha", "Fecha y hora", ColumnType.DATETIME), col("paciente", "Paciente", ColumnType.TEXT),
                col("telefono", "Teléfono", ColumnType.TEXT), col("profesional", "Profesional", ColumnType.TEXT),
                col("sede", "Sede", ColumnType.TEXT), col("estado", "Estado", ColumnType.TEXT), col("motivo", "Motivo", ColumnType.TEXT));
        var args = new ArrayList<Object>(List.of(clinicId, from, to));
        String site = siteFilter("a.site_id", siteId, args);
        var rows = db.query("""
                select a.starts_at, %s as patient, pt.phone, u.full_name as dentist, s.name as site, a.status, a.reason
                from appointment a join patient pt on pt.id = a.patient_id join app_user u on u.id = a.dentist_id
                join site s on s.id = a.site_id
                where a.clinic_id = ? and (a.starts_at at time zone 'America/Bogota')::date between ? and ? %s
                order by a.starts_at""".formatted(PATIENT_NAME, site),
                (rs, i) -> row("fecha", rs.getTimestamp("starts_at").toInstant(), "paciente", rs.getString("patient"),
                        "telefono", rs.getString("phone"), "profesional", rs.getString("dentist"), "sede", rs.getString("site"),
                        "estado", APPOINTMENT_STATUS.get(rs.getString("status")), "motivo", rs.getString("reason")), args.toArray());
        long attended = rows.stream().filter(r -> "Atendida".equals(r.get("estado"))).count();
        return report("citas", "Citas", "Citas del periodo con su estado (%d atendidas de %d).".formatted(attended, rows.size()),
                cols, rows, Map.of());
    }

    /**
     * Archivo de gestión: historias con atención en los últimos 5 años; histórico: sin atención hace más de 5 años
     * (Resolución 839 de 2017). Última atención = evolución firmada o cita atendida más reciente.
     */
    private TableReport archive(UUID clinicId, boolean active) {
        var cols = List.of(col("paciente", "Paciente", ColumnType.TEXT), col("documento", "Documento", ColumnType.TEXT),
                col("ultima", "Última atención", ColumnType.DATE), col("anios", "Años sin atención", ColumnType.NUMBER),
                col("registro", "Registrado", ColumnType.DATE));
        LocalDate cut = LocalDate.now(BOGOTA).minusYears(5);
        var rows = db.query("""
                with last as (
                    select pt.id, greatest(
                        (select max(n.attended_at) from clinical_note n where n.patient_id = pt.id and n.signed_at is not null),
                        (select max(a.starts_at) from appointment a where a.patient_id = pt.id and a.status = 'ATTENDED')) as last_at,
                        pt.created_at
                    from patient pt where pt.clinic_id = ?)
                select %s as patient, %s as doc, l.last_at, l.created_at
                from last l join patient pt on pt.id = l.id
                where %s
                order by l.last_at nulls first, pt.first_last_name""".formatted(PATIENT_NAME, PATIENT_DOC, active
                        ? "(l.last_at at time zone 'America/Bogota')::date >= ?"
                        : "coalesce((l.last_at at time zone 'America/Bogota')::date, (l.created_at at time zone 'America/Bogota')::date) < ?"),
                (rs, i) -> {
                    var last = rs.getTimestamp("last_at");
                    LocalDate lastDate = last == null ? null : last.toInstant().atZone(BOGOTA).toLocalDate();
                    return row("paciente", rs.getString("patient"), "documento", rs.getString("doc"), "ultima", lastDate,
                            "anios", lastDate == null ? null : BigDecimal.valueOf(java.time.Period.between(lastDate, LocalDate.now(BOGOTA)).getYears()),
                            "registro", rs.getTimestamp("created_at").toInstant().atZone(BOGOTA).toLocalDate());
                }, clinicId, cut);
        return active
                ? report("archivo-gestion", "Archivo de gestión", "Historias clínicas con atención en los últimos 5 años (Res. 839 de 2017). Estado a hoy.", cols, rows, Map.of())
                : report("archivo-historico", "Archivo histórico", "Historias sin atención hace más de 5 años: pasan al archivo central (Res. 839 de 2017). Estado a hoy.", cols, rows, Map.of());
    }

    private TableReport birthdays(UUID clinicId, LocalDate from, LocalDate to) {
        var cols = List.of(col("cumple", "Cumpleaños", ColumnType.DATE), col("paciente", "Paciente", ColumnType.TEXT),
                col("edad", "Cumple (años)", ColumnType.NUMBER), col("telefono", "Teléfono", ColumnType.TEXT),
                col("correo", "Correo", ColumnType.TEXT));
        var rows = new ArrayList<Map<String, Object>>();
        db.query("select %s as patient, pt.birth_date, pt.phone, pt.email from patient pt where pt.clinic_id = ? and pt.active".formatted(PATIENT_NAME),
                rs -> {
                    LocalDate birth = rs.getDate("birth_date").toLocalDate();
                    for (int year = from.getYear(); year <= to.getYear(); year++) {
                        LocalDate day = birth.withYear(year);
                        if (!day.isBefore(from) && !day.isAfter(to)) {
                            rows.add(row("cumple", day, "paciente", rs.getString("patient"),
                                    "edad", BigDecimal.valueOf(year - birth.getYear()), "telefono", rs.getString("phone"),
                                    "correo", rs.getString("email")));
                        }
                    }
                }, clinicId);
        rows.sort(java.util.Comparator.comparing(r -> (LocalDate) r.get("cumple")));
        return report("cumpleanos", "Cumpleaños", "Pacientes activos que cumplen años en el periodo.", cols, limit(rows), Map.of());
    }

    private TableReport waste(UUID clinicId, LocalDate from, LocalDate to, UUID siteId) {
        var cols = List.of(col("tipo", "Tipo de residuo", ColumnType.TEXT), col("registros", "Registros", ColumnType.NUMBER),
                col("kg", "Peso total (kg)", ColumnType.NUMBER));
        var args = new ArrayList<Object>(List.of(clinicId, from, to));
        String site = siteFilter("site_id", siteId, args);
        var rows = db.query("""
                select data->>'wasteType' as type, count(*) as n, sum((data->>'weightKg')::numeric) as kg
                from biosafety_record
                where clinic_id = ? and kind = 'WASTE' and voided_at is null and record_date between ? and ? %s
                group by 1 order by 3 desc""".formatted(site),
                (rs, i) -> row("tipo", WASTE.getOrDefault(rs.getString("type"), rs.getString("type")),
                        "registros", BigDecimal.valueOf(rs.getLong("n")), "kg", rs.getBigDecimal("kg")), args.toArray());
        return report("residuos", "Residuos", "Residuos generados por tipo (registros de Bioseguridad → Residuos), para el RH1.",
                cols, rows, Map.of("kg", sum(rows, "kg", r -> true)));
    }

    // ---------- Inventarios ----------

    private TableReport stock(UUID clinicId, UUID siteId) {
        var cols = List.of(col("codigo", "Código", ColumnType.TEXT), col("insumo", "Insumo", ColumnType.TEXT),
                col("sede", "Sede", ColumnType.TEXT), col("lote", "Lote", ColumnType.TEXT), col("vence", "Vence", ColumnType.DATE),
                col("cantidad", "Cantidad", ColumnType.NUMBER), col("unidad", "Unidad", ColumnType.TEXT),
                col("minimo", "Mínimo", ColumnType.NUMBER), col("alerta", "Alerta", ColumnType.TEXT));
        var args = new ArrayList<Object>(List.of(clinicId));
        String site = siteFilter("b.site_id", siteId, args);
        LocalDate today = LocalDate.now(BOGOTA);
        var rows = db.query("""
                select it.code, it.name, it.unit, it.minimum, s.name as site, b.lot, b.expires_on, b.quantity,
                       sum(b.quantity) over (partition by it.id, b.site_id) as site_total
                from inventory_batch b join inventory_item it on it.id = b.item_id join site s on s.id = b.site_id
                where b.clinic_id = ? and it.active %s and b.quantity > 0
                order by it.name, s.name, b.expires_on nulls last""".formatted(site),
                (rs, i) -> {
                    var expires = rs.getDate("expires_on");
                    LocalDate exp = expires == null ? null : expires.toLocalDate();
                    String alert = exp != null && exp.isBefore(today) ? "Vencido"
                            : exp != null && !exp.isAfter(today.plusDays(30)) ? "Vence en 30 días"
                            : rs.getBigDecimal("site_total").compareTo(rs.getBigDecimal("minimum")) < 0 ? "Bajo el mínimo" : null;
                    return row("codigo", rs.getString("code"), "insumo", rs.getString("name"), "sede", rs.getString("site"),
                            "lote", rs.getString("lot"), "vence", exp, "cantidad", rs.getBigDecimal("quantity"),
                            "unidad", rs.getString("unit"), "minimo", rs.getBigDecimal("minimum"), "alerta", alert);
                }, args.toArray());
        return report("inventarios", "Inventarios", "Existencias por insumo, sede y lote, con vencimientos y mínimos. Estado a hoy.",
                cols, rows, Map.of());
    }

    private TableReport movements(UUID clinicId, LocalDate from, LocalDate to, UUID siteId) {
        var cols = List.of(col("fecha", "Fecha", ColumnType.DATETIME), col("insumo", "Insumo", ColumnType.TEXT),
                col("sede", "Sede", ColumnType.TEXT), col("lote", "Lote", ColumnType.TEXT), col("tipo", "Movimiento", ColumnType.TEXT),
                col("cantidad", "Cantidad", ColumnType.NUMBER), col("saldo", "Saldo", ColumnType.NUMBER),
                col("motivo", "Motivo", ColumnType.TEXT), col("usuario", "Usuario", ColumnType.TEXT));
        var args = new ArrayList<Object>(List.of(clinicId, from, to));
        String site = siteFilter("b.site_id", siteId, args);
        var rows = db.query("""
                select m.created_at, it.name, s.name as site, b.lot, m.kind, m.delta, m.balance, m.reason, u.full_name
                from inventory_movement m join inventory_batch b on b.id = m.batch_id join inventory_item it on it.id = b.item_id
                join site s on s.id = b.site_id left join app_user u on u.id = m.created_by
                where m.clinic_id = ? and (m.created_at at time zone 'America/Bogota')::date between ? and ? %s
                order by m.created_at limit %d""".formatted(site, MAX_ROWS),
                (rs, i) -> row("fecha", rs.getTimestamp("created_at").toInstant(), "insumo", rs.getString("name"),
                        "sede", rs.getString("site"), "lote", rs.getString("lot"), "tipo", MOVEMENTS.get(rs.getString("kind")),
                        "cantidad", rs.getBigDecimal("delta"), "saldo", rs.getBigDecimal("balance"),
                        "motivo", rs.getString("reason"), "usuario", rs.getString("full_name")), args.toArray());
        return report("movimientos-inventario", "Movimientos de inventario", "Entradas, consumos, descartes, ajustes y traslados del periodo.",
                cols, rows, Map.of());
    }

    // ---------- IPS ----------

    private TableReport activities(UUID clinicId, LocalDate from, LocalDate to) {
        var cols = List.of(col("cups", "CUPS", ColumnType.TEXT), col("descripcion", "Descripción", ColumnType.TEXT),
                col("cantidad", "Cantidad", ColumnType.NUMBER), col("valor", "Valor", ColumnType.MONEY));
        var rows = db.query("""
                select coalesce(cups, 'Sin CUPS') as cups, min(description) as description, sum(qty) as qty, sum(value) as value from (
                    select i.cups_code as cups, i.description, i.quantity as qty, i.unit_price * i.quantity - i.discount as value
                    from treatment_item i
                    where i.clinic_id = ? and i.status = 'DONE' and (i.done_at at time zone 'America/Bogota')::date between ? and ?
                    union all
                    select pi.cups_code, pi.description, pi.quantity, pi.total
                    from payment_item pi join payment p on p.id = pi.payment_id
                    where pi.clinic_id = ? and p.voided_at is null and p.income_date between ? and ?) a
                group by coalesce(cups, 'Sin CUPS'), case when cups is null then description end
                order by 3 desc""",
                (rs, i) -> row("cups", rs.getString("cups"), "descripcion", rs.getString("description"),
                        "cantidad", rs.getBigDecimal("qty"), "valor", rs.getBigDecimal("value")),
                clinicId, from, to, clinicId, from, to);
        return report("actividades", "Actividades", "Procedimientos realizados en planes y cobrados en recibos de venta, por código CUPS.",
                cols, rows, Map.of("cantidad", sum(rows, "cantidad", r -> true), "valor", sum(rows, "valor", r -> true)));
    }

    private TableReport opportunity(UUID clinicId, LocalDate from, LocalDate to, UUID siteId) {
        var cols = List.of(col("profesional", "Profesional", ColumnType.TEXT), col("citas", "Citas", ColumnType.NUMBER),
                col("promedio", "Promedio (días)", ColumnType.NUMBER), col("maximo", "Máximo (días)", ColumnType.NUMBER));
        var args = new ArrayList<Object>(List.of(clinicId, from, to));
        String site = siteFilter("a.site_id", siteId, args);
        String days = "greatest(0, extract(epoch from (a.starts_at - a.created_at)) / 86400.0)";
        var rows = db.query("""
                select coalesce(u.full_name, 'Total') as dentist, count(*) as n, round(avg(%s)::numeric, 1) as avg_days,
                       round(max(%s)::numeric, 1) as max_days
                from appointment a join app_user u on u.id = a.dentist_id
                where a.clinic_id = ? and a.status <> 'CANCELLED' and (a.starts_at at time zone 'America/Bogota')::date between ? and ? %s
                group by rollup (u.full_name) order by grouping(u.full_name), u.full_name""".formatted(days, days, site),
                (rs, i) -> row("profesional", rs.getString("dentist"), "citas", BigDecimal.valueOf(rs.getLong("n")),
                        "promedio", rs.getBigDecimal("avg_days"), "maximo", rs.getBigDecimal("max_days")), args.toArray());
        return report("oportunidad-citas", "Oportunidad de citas",
                "Días entre la solicitud (creación de la cita) y la fecha asignada, por profesional; la última fila es el total.",
                cols, rows, Map.of());
    }

    /**
     * Índice COP por paciente (dentición permanente) desde el odontograma vigente: C = caries, extracción indicada o
     * resto radicular; P = ausente; O = obturado (resina, amalgama, provisional o corona) sin caries.
     */
    private TableReport cop(UUID clinicId) {
        var cols = List.of(col("paciente", "Paciente", ColumnType.TEXT), col("edad", "Edad", ColumnType.NUMBER),
                col("c", "C (cariados)", ColumnType.NUMBER), col("o", "O (obturados)", ColumnType.NUMBER),
                col("p", "P (perdidos)", ColumnType.NUMBER), col("cop", "COP", ColumnType.NUMBER));
        var rows = db.query("""
                with t as (
                    select patient_id, tooth,
                           bool_or(condition in ('CARIES', 'EXTRACTION_INDICATED', 'REMNANT_ROOT')) as c,
                           bool_or(condition = 'MISSING') as p,
                           bool_or(condition in ('RESIN', 'AMALGAM', 'TEMPORARY_FILLING', 'CROWN')) as o
                    from odontogram_entry
                    where clinic_id = ? and removed_at is null and tooth / 10 between 1 and 4
                    group by patient_id, tooth)
                select %s as patient, extract(year from age(pt.birth_date))::int as age,
                       sum(t.c::int) as c, sum((not t.c and t.p)::int) as p, sum((not t.c and not t.p and t.o)::int) as o
                from t join patient pt on pt.id = t.patient_id
                group by pt.id order by pt.first_last_name, pt.first_name""".formatted(PATIENT_NAME),
                (rs, i) -> {
                    int c = rs.getInt("c"), o = rs.getInt("o"), p = rs.getInt("p");
                    return row("paciente", rs.getString("patient"), "edad", BigDecimal.valueOf(rs.getInt("age")),
                            "c", BigDecimal.valueOf(c), "o", BigDecimal.valueOf(o), "p", BigDecimal.valueOf(p),
                            "cop", BigDecimal.valueOf(c + o + p));
                }, clinicId);
        Map<String, Object> totals = new LinkedHashMap<>();
        if (!rows.isEmpty()) {
            for (String k : List.of("c", "o", "p", "cop")) {
                totals.put(k, sum(rows, k, r -> true).divide(BigDecimal.valueOf(rows.size()), 2, java.math.RoundingMode.HALF_UP));
            }
        }
        return report("cop", "COP por persona", "Índice COP de dentición permanente según el odontograma vigente; el total es el promedio por persona.",
                cols, rows, totals);
    }

    private TableReport invoices(UUID clinicId, LocalDate from, LocalDate to) {
        var cols = List.of(col("borrador", "Borrador", ColumnType.TEXT), col("fecha", "Creado", ColumnType.DATE),
                col("paciente", "Paciente", ColumnType.TEXT), col("estado", "Estado", ColumnType.TEXT),
                col("preparada", "Preparada", ColumnType.DATETIME), col("total", "Total", ColumnType.MONEY));
        var rows = db.query("""
                select b.draft_number, b.created_at, %s as patient, b.status, b.prepared_at, b.total
                from billing_invoice b join patient pt on pt.id = b.patient_id
                where b.clinic_id = ? and (b.created_at at time zone 'America/Bogota')::date between ? and ?
                order by b.draft_number""".formatted(PATIENT_NAME),
                (rs, i) -> row("borrador", String.valueOf(rs.getLong("draft_number")),
                        "fecha", rs.getTimestamp("created_at").toInstant().atZone(BOGOTA).toLocalDate(),
                        "paciente", rs.getString("patient"), "estado", INVOICE_STATUS.get(rs.getString("status")),
                        "preparada", rs.getTimestamp("prepared_at") == null ? null : rs.getTimestamp("prepared_at").toInstant(),
                        "total", rs.getBigDecimal("total")), clinicId, from, to);
        return report("fev-rips", "FEV RIPS", "Facturas electrónicas de venta (borradores, preparadas y anuladas) con sus RIPS.",
                cols, rows, Map.of("total", sum(rows, "total", r -> !"Anulada".equals(r.get("estado")))));
    }

    // ---------- Utilidades ----------

    private static Column col(String key, String label, ColumnType type) {
        return new Column(key, label, type);
    }

    /** Fila a partir de pares clave, valor (admite valores null). */
    private static Map<String, Object> row(Object... kv) {
        var m = new LinkedHashMap<String, Object>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    private static String siteFilter(String column, UUID siteId, List<Object> args) {
        if (siteId == null) return "";
        args.add(siteId);
        return " and " + column + " = ?";
    }

    private static BigDecimal sum(List<Map<String, Object>> rows, String key, java.util.function.Predicate<Map<String, Object>> include) {
        return rows.stream().filter(include).map(r -> r.get(key)).filter(v -> v instanceof BigDecimal)
                .map(v -> (BigDecimal) v).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static List<Map<String, Object>> limit(List<Map<String, Object>> rows) {
        return rows.size() > MAX_ROWS ? rows.subList(0, MAX_ROWS) : rows;
    }

    private static TableReport report(String key, String title, String description, List<Column> columns,
                                      List<Map<String, Object>> rows, Map<String, Object> totals) {
        return new TableReport(key, title, description, columns, limit(rows), totals, rows.size() > MAX_ROWS);
    }

    private static String csvCell(Object v) {
        if (v == null) return "";
        String s = v instanceof java.time.Instant inst ? inst.atZone(BOGOTA).toLocalDateTime().withNano(0).toString().replace('T', ' ')
                : v instanceof BigDecimal b ? b.toPlainString().replace('.', ',') : v.toString();
        return s.contains(";") || s.contains("\"") || s.contains("\n") ? "\"" + s.replace("\"", "\"\"") + "\"" : s;
    }
}
