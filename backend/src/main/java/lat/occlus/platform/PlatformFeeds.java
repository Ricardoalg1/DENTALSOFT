package lat.occlus.platform;

import static lat.occlus.platform.SubscriptionBilling.ts;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lat.occlus.platform.PlatformDtos.AnnouncementRequest;
import lat.occlus.platform.PlatformDtos.AnnouncementRow;
import lat.occlus.platform.PlatformDtos.AuditRow;
import lat.occlus.platform.PlatformDtos.ClinicAlert;
import lat.occlus.platform.PlatformDtos.ClinicAnnouncement;
import lat.occlus.platform.PlatformDtos.EventRow;
import lat.occlus.platform.PlatformDtos.ModuleInfo;
import lat.occlus.platform.PlatformDtos.NotificationRow;
import lat.occlus.platform.PlatformDtos.Overview;
import lat.occlus.platform.PlatformDtos.PlanDto;
import lat.occlus.platform.PlatformDtos.PlanUpdate;
import lat.occlus.platform.PlatformDtos.StatusCounts;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.NotFoundException;
import lat.occlus.shared.web.PageResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

/** Resumen, planes, auditoría, eventos, notificaciones y avisos. Solo el panel, ya autorizado y en modo sistema. */
@Service
@RequiredArgsConstructor
public class PlatformFeeds {

    private final JdbcTemplate db;
    private final ObjectMapper mapper;
    private final PlatformProperties props;
    private final PaymentGateway gateway;
    private final PlanCatalog plans;
    private final PlatformAudit audit;

    // ---------- Catálogos ----------

    public List<ModuleInfo> modules() {
        return java.util.Arrays.stream(AppModule.values()).map(m -> new ModuleInfo(m.name(), m.label(), m.description(),
                m.requires().stream().map(Enum::name).sorted().toList())).toList();
    }

    @Transactional(readOnly = true)
    public List<PlanDto> plans() {
        return plans.all().stream().map(PlatformFeeds::plan).toList();
    }

    @Transactional
    public PlanDto updatePlan(AuthUser me, String code, PlanUpdate req) {
        var before = plans.require(code);
        var problems = AppModule.dependencyProblems(req.modules());
        if (!problems.isEmpty()) throw new BadRequestException(String.join(" ", problems));
        if ((req.priceMonthly() == null) != (req.priceAnnual() == null)) {
            throw new BadRequestException("Indica ambos precios (mensual y anual) o ninguno si el plan se cotiza.");
        }
        db.update("""
                update subscription_plan set name = ?, max_users = ?, price_monthly = ?, price_annual = ?,
                       modules = ?::varchar[], active = ?, updated_at = now() where code = ?""",
                req.name().trim(), req.maxUsers(), req.priceMonthly(), req.priceAnnual(),
                PlanCatalog.pgArray(req.modules()), req.active(), code);
        audit.record(me, "PLAN_EDITED", null, "Editó el plan " + req.name().trim(),
                Views.details("code", code,
                        "before", Views.details("price", String.valueOf(before.priceMonthly()), "maxUsers", before.maxUsers(),
                                "modules", before.modules().stream().map(Enum::name).sorted().toList(), "active", before.active()),
                        "after", Views.details("price", String.valueOf(req.priceMonthly()), "maxUsers", req.maxUsers(),
                                "modules", req.modules().stream().map(Enum::name).sorted().toList(), "active", req.active()),
                        "note", "No cambia a los clientes que ya tienen el plan."));
        return plan(plans.require(code));
    }

    private static PlanDto plan(PlanCatalog.Plan p) {
        return new PlanDto(p.code(), p.name(), p.maxUsers(), p.priceMonthly(), p.priceAnnual(),
                p.modules().stream().map(Enum::name).sorted().toList(), p.active(), p.sortOrder());
    }

    // ---------- Resumen ----------

    @Transactional(readOnly = true)
    public Overview overview() {
        long[] c = new long[5];
        long total = 0;
        for (var row : db.queryForList("select status, count(*) as n from clinic_subscription group by status")) {
            long n = ((Number) row.get("n")).longValue();
            total += n;
            switch ((String) row.get("status")) {
                case "TRIAL" -> c[0] = n;
                case "ACTIVE" -> c[1] = n;
                case "PAST_DUE" -> c[2] = n;
                case "SUSPENDED" -> c[3] = n;
                case "CANCELLED" -> c[4] = n;
                default -> { }
            }
        }
        BigDecimal mrr = db.queryForObject("""
                select coalesce(round(sum(case billing_cycle when 'MONTHLY' then price else price / 12 end), 2), 0)
                from clinic_subscription where status in ('ACTIVE', 'PAST_DUE')""", BigDecimal.class);
        Instant now = Instant.now();
        Timestamp week = ts(now.plus(Duration.ofDays(7)));
        var trials = alerts("""
                select cs.clinic_id, c.name, cs.status, cs.trial_ends_at as d, cs.price from clinic_subscription cs
                join clinic c on c.id = cs.clinic_id where cs.status = 'TRIAL' and cs.trial_ends_at <= ? order by d limit 10""", week);
        var pastDue = alerts("""
                select cs.clinic_id, c.name, cs.status, cs.past_due_since as d, cs.price from clinic_subscription cs
                join clinic c on c.id = cs.clinic_id where cs.status = 'PAST_DUE' order by d limit 10""");
        var renewals = alerts("""
                select cs.clinic_id, c.name, cs.status, cs.current_period_end as d, cs.price from clinic_subscription cs
                join clinic c on c.id = cs.clinic_id
                where cs.status = 'ACTIVE' and cs.current_period_end is not null and not cs.cancel_at_period_end
                  and cs.current_period_end <= ? order by d limit 10""", week);
        long unread = db.queryForObject("select count(*) from platform_notification where read_at is null", Long.class);
        var recent = db.query("select * from platform_event order by at desc limit 10", this::event);
        return new Overview(gateway.provider(), props.schedulerEnabled(), props.graceDays(),
                new StatusCounts(total, c[0], c[1], c[2], c[3], c[4]), mrr, mrr.multiply(BigDecimal.valueOf(12)),
                trials, pastDue, renewals, unread, recent);
    }

    private List<ClinicAlert> alerts(String sql, Object... args) {
        return db.query(sql, (rs, i) -> new ClinicAlert(rs.getObject("clinic_id", UUID.class), rs.getString("name"),
                rs.getString("status"), rs.getTimestamp("d").toInstant(), rs.getBigDecimal("price")), args);
    }

    // ---------- Auditoría y eventos ----------

    @Transactional(readOnly = true)
    public PageResponse<AuditRow> audit(UUID clinicId, String action, String q, int page, int size) {
        var where = new StringBuilder(" where true");
        var args = new ArrayList<Object>();
        if (clinicId != null) { where.append(" and clinic_id = ?"); args.add(clinicId); }
        if (action != null && !action.isBlank()) { where.append(" and action = ?"); args.add(action); }
        if (q != null && !q.isBlank()) {
            where.append(" and (summary ilike ? escape '!' or actor_name ilike ? escape '!' or clinic_name ilike ? escape '!')");
            String term = Views.like(q);
            for (int i = 0; i < 3; i++) args.add(term);
        }
        return page("platform_audit", where.toString(), args, "at desc", page, size, (rs, i) -> new AuditRow(
                rs.getObject("id", UUID.class), rs.getTimestamp("at").toInstant(), rs.getObject("actor_id", UUID.class),
                rs.getString("actor_name"), rs.getString("action"), rs.getObject("clinic_id", UUID.class),
                rs.getString("clinic_name"), rs.getString("summary"), json(rs.getString("details")), rs.getString("request_id")));
    }

    @Transactional(readOnly = true)
    public List<String> auditActions() {
        return db.queryForList("select distinct action from platform_audit order by action", String.class);
    }

    @Transactional(readOnly = true)
    public PageResponse<EventRow> events(UUID clinicId, String severity, int page, int size) {
        var where = new StringBuilder(" where true");
        var args = new ArrayList<Object>();
        if (clinicId != null) { where.append(" and clinic_id = ?"); args.add(clinicId); }
        if (severity != null && !severity.isBlank()) {
            try { args.add(Severity.valueOf(severity).name()); } catch (IllegalArgumentException e) { throw new BadRequestException("Severidad inválida."); }
            where.append(" and severity = ?");
        }
        return page("platform_event", where.toString(), args, "at desc", page, size, this::event);
    }

    private EventRow event(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        return new EventRow(rs.getObject("id", UUID.class), rs.getTimestamp("at").toInstant(),
                rs.getObject("clinic_id", UUID.class), rs.getString("clinic_name"), rs.getString("kind"),
                rs.getString("severity"), rs.getString("title"), json(rs.getString("detail")));
    }

    // ---------- Notificaciones ----------

    @Transactional(readOnly = true)
    public PageResponse<NotificationRow> notifications(boolean unreadOnly, int page, int size) {
        String where = unreadOnly ? " where n.read_at is null" : "";
        long total = db.queryForObject("select count(*) from platform_notification n" + where, Long.class);
        int s = Math.clamp(size, 1, 100), p = Math.max(page, 0);
        var rows = db.query("""
                select n.id as nid, n.created_at as ncreated, n.read_at, e.* from platform_notification n
                join platform_event e on e.id = n.event_id""" + where + " order by n.created_at desc limit ? offset ?",
                (rs, i) -> new NotificationRow(rs.getObject("nid", UUID.class), rs.getTimestamp("ncreated").toInstant(),
                        rs.getTimestamp("read_at") == null ? null : rs.getTimestamp("read_at").toInstant(), event(rs, i)),
                s, p * s);
        return new PageResponse<>(rows, p, s, total, (int) Math.ceil(total / (double) s));
    }

    @Transactional
    public void markRead(AuthUser me, UUID id) {
        int n = db.update("update platform_notification set read_at = now(), read_by = ? where id = ? and read_at is null", me.userId(), id);
        if (n == 0 && db.queryForObject("select count(*) from platform_notification where id = ?", Long.class, id) == 0) {
            throw new NotFoundException("Notificación no encontrada");
        }
    }

    @Transactional
    public int markAllRead(AuthUser me) {
        return db.update("update platform_notification set read_at = now(), read_by = ? where read_at is null", me.userId());
    }

    // ---------- Avisos a las clínicas ----------

    @Transactional(readOnly = true)
    public List<AnnouncementRow> announcements() {
        return db.query("""
                select a.*, c.name as clinic_name from platform_announcement a left join clinic c on c.id = a.clinic_id
                order by a.created_at desc limit 100""", (rs, i) -> new AnnouncementRow(rs.getObject("id", UUID.class),
                rs.getObject("clinic_id", UUID.class), rs.getString("clinic_name"), rs.getString("title"), rs.getString("body"),
                rs.getString("level"), rs.getTimestamp("starts_at").toInstant(), instant(rs.getTimestamp("ends_at")),
                rs.getTimestamp("created_at").toInstant(), instant(rs.getTimestamp("archived_at"))));
    }

    @Transactional
    public void announce(AuthUser me, AnnouncementRequest req) {
        if (!req.level().equals("INFO") && !req.level().equals("WARNING")) throw new BadRequestException("Nivel inválido.");
        if (req.endsAt() != null && !req.endsAt().isAfter(Instant.now())) throw new BadRequestException("El fin del aviso debe ser futuro.");
        if (req.clinicId() != null && db.queryForObject("select count(*) from clinic where id = ?", Long.class, req.clinicId()) == 0) {
            throw new NotFoundException("Cliente no encontrado");
        }
        db.update("""
                insert into platform_announcement (id, clinic_id, title, body, level, ends_at, created_by)
                values (?, ?, ?, ?, ?, ?, ?)""", UUID.randomUUID(), req.clinicId(), req.title().trim(), req.body().trim(),
                req.level(), req.endsAt() == null ? null : ts(req.endsAt()), me.userId());
        audit.record(me, "ANNOUNCEMENT_CREATED", req.clinicId(), "Publicó el aviso «%s»".formatted(req.title().trim()),
                Views.details("level", req.level(), "audience", req.clinicId() == null ? "todos los clientes" : "un cliente"));
    }

    @Transactional
    public void archiveAnnouncement(AuthUser me, UUID id) {
        var title = db.queryForList("select title from platform_announcement where id = ? and archived_at is null", String.class, id)
                .stream().findFirst().orElseThrow(() -> new NotFoundException("Aviso no encontrado o ya archivado"));
        db.update("update platform_announcement set archived_at = now() where id = ?", id);
        audit.record(me, "ANNOUNCEMENT_ARCHIVED", null, "Archivó el aviso «%s»".formatted(title), Views.details());
    }

    /** Avisos vigentes para la clínica autenticada (RLS: ve los generales y los suyos). */
    @Transactional(readOnly = true)
    public List<ClinicAnnouncement> visibleToClinic() {
        return db.query("""
                select id, title, body, level from platform_announcement
                where archived_at is null and starts_at <= now() and (ends_at is null or ends_at > now())
                order by created_at desc limit 5""", (rs, i) -> new ClinicAnnouncement(rs.getObject("id", UUID.class),
                rs.getString("title"), rs.getString("body"), rs.getString("level")));
    }

    // ---------- Apoyo ----------

    private <T> PageResponse<T> page(String table, String where, List<Object> args, String order, int page, int size,
                                     org.springframework.jdbc.core.RowMapper<T> mapper) {
        long total = db.queryForObject("select count(*) from " + table + where, Long.class, args.toArray());
        int s = Math.clamp(size, 1, 100), p = Math.max(page, 0);
        var rowArgs = new ArrayList<>(args);
        rowArgs.add(s);
        rowArgs.add(p * s);
        var rows = db.query("select * from " + table + where + " order by " + order + " limit ? offset ?", mapper, rowArgs.toArray());
        return new PageResponse<>(rows, p, s, total, (int) Math.ceil(total / (double) s));
    }

    private Object json(String text) {
        return text == null ? null : mapper.readTree(text);
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }
}
