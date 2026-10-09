package lat.occlus.platform;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import lat.occlus.platform.PlatformDtos.AdminUser;
import lat.occlus.platform.PlatformDtos.ClientProfile;
import lat.occlus.platform.PlatformDtos.ClientProfileUpdate;
import lat.occlus.platform.PlatformDtos.ClinicDetail;
import lat.occlus.platform.PlatformDtos.ClinicRow;
import lat.occlus.platform.PlatformDtos.PaymentMethodView;
import lat.occlus.platform.PlatformDtos.Usage;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.NotFoundException;
import lat.occlus.shared.web.PageResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Consulta y edición de clientes. Solo se llama desde el panel, ya autorizado y en modo sistema.
 * Expone únicamente datos comerciales y conteos: ningún dato de pacientes.
 */
@Service
@RequiredArgsConstructor
public class ClientAdmin {

    private final JdbcTemplate db;
    private final Entitlements entitlements;
    private final PlatformAudit audit;

    @Transactional(readOnly = true)
    public PageResponse<ClinicRow> list(String q, String status, String plan, int page, int size) {
        var where = new StringBuilder(" where true");
        var args = new ArrayList<Object>();
        if (q != null && !q.isBlank()) {
            where.append(" and (c.name ilike ? escape '!' or c.nit ilike ? escape '!' or pc.contact_email ilike ? escape '!'"
                    + " or pc.contact_name ilike ? escape '!')");
            String term = Views.like(q);
            for (int i = 0; i < 4; i++) args.add(term);
        }
        if (status != null && !status.isBlank()) {
            try {
                where.append(" and cs.status = ?");
                args.add(SubscriptionStatus.valueOf(status).name());
            } catch (IllegalArgumentException e) {
                throw new BadRequestException("Estado inválido.");
            }
        }
        if (plan != null && !plan.isBlank()) {
            where.append(" and cs.plan_code = ?");
            args.add(plan);
        }
        String from = """
                from clinic c
                join clinic_subscription cs on cs.clinic_id = c.id
                join subscription_plan sp on sp.code = cs.plan_code
                left join platform_client pc on pc.clinic_id = c.id""";
        long total = db.queryForObject("select count(*) " + from + where, Long.class, args.toArray());
        int safeSize = Math.clamp(size, 1, 100);
        int safePage = Math.max(page, 0);
        var rowArgs = new ArrayList<>(args);
        rowArgs.add(safeSize);
        rowArgs.add(safePage * safeSize);
        var rows = db.query("""
                select c.id, c.name, c.nit, pc.city, pc.contact_name, pc.contact_email, cs.plan_code, sp.name as plan_name,
                       cs.status, cs.billing_cycle, cs.price, cs.modules, cs.max_users, cs.trial_ends_at,
                       cs.current_period_end, c.created_at,
                       (select count(*) from app_user u where u.clinic_id = c.id and u.active) as users_active,
                       (select count(*) from patient p where p.clinic_id = c.id) as patients,
                       (select max(r.rev_timestamp) from audit_revision r where r.clinic_id = c.id) as last_activity_ms
                """ + from + where + " order by c.created_at desc limit ? offset ?", (rs, i) -> new ClinicRow(
                rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("nit"), rs.getString("city"),
                rs.getString("contact_name"), rs.getString("contact_email"), rs.getString("plan_code"),
                rs.getString("plan_name"), rs.getString("status"), rs.getString("billing_cycle"), rs.getBigDecimal("price"),
                Entitlements.modules(rs.getArray("modules")).stream().map(Enum::name).sorted().toList(),
                rs.getLong("users_active"), (Integer) rs.getObject("max_users"), rs.getLong("patients"),
                instant(rs.getTimestamp("trial_ends_at")), instant(rs.getTimestamp("current_period_end")),
                instant(rs.getTimestamp("created_at")), epoch(rs.getObject("last_activity_ms"))), rowArgs.toArray());
        return new PageResponse<>(rows, safePage, safeSize, total, (int) Math.ceil(total / (double) safeSize));
    }

    @Transactional(readOnly = true)
    public ClinicDetail detail(UUID id) {
        var base = db.query("""
                select c.id, c.name, c.nit, c.created_at, pc.legal_name, pc.contact_name, pc.contact_email, pc.contact_phone,
                       pc.city, pc.internal_notes, pc.source
                from clinic c left join platform_client pc on pc.clinic_id = c.id where c.id = ?""",
                (rs, i) -> new Object[] {rs.getString("name"), rs.getString("nit"), instant(rs.getTimestamp("created_at")),
                        new ClientProfile(rs.getString("legal_name"), rs.getString("contact_name"),
                                rs.getString("contact_email"), rs.getString("contact_phone"), rs.getString("city"),
                                rs.getString("internal_notes"), rs.getString("source"))}, id)
                .stream().findFirst().orElseThrow(() -> new NotFoundException("Cliente no encontrado"));
        var sub = entitlements.find(id).orElseThrow(() -> new NotFoundException("El cliente no tiene suscripción"));
        var method = db.query("select provider, label from subscription_payment_method where clinic_id = ?",
                (rs, i) -> new PaymentMethodView(rs.getString("provider"), rs.getString("label")), id).stream().findFirst().orElse(null);
        var admins = db.query("select id, email, full_name, active from app_user where clinic_id = ? and role = 'ADMIN' order by full_name",
                (rs, i) -> new AdminUser(rs.getObject("id", UUID.class), rs.getString("email"), rs.getString("full_name"),
                        rs.getBoolean("active")), id);
        return new ClinicDetail(id, (String) base[0], (String) base[1], (Instant) base[2], (ClientProfile) base[3],
                Views.subscription(sub, entitlements.grace()), method, usage(id), admins);
    }

    /** Solo conteos agregados. */
    private Usage usage(UUID id) {
        return new Usage(
                count("select count(*) from app_user where clinic_id = ? and active", id),
                count("select count(*) from app_user where clinic_id = ?", id),
                count("select count(*) from site where clinic_id = ?", id),
                count("select count(*) from patient where clinic_id = ?", id),
                count("select count(*) from appointment where clinic_id = ? and starts_at >= now() - interval '30 days'", id),
                count("select coalesce(sum(size_bytes), 0) from patient_file where clinic_id = ?", id),
                epoch(db.queryForObject("select max(rev_timestamp) from audit_revision where clinic_id = ?", Long.class, id)));
    }

    @Transactional
    public ClinicDetail updateClient(AuthUser me, UUID id, ClientProfileUpdate req) {
        var before = detail(id);
        var b = before.client();
        db.update("update clinic set name = ?, nit = ? where id = ?", req.clinicName().trim(), blank(req.nit()), id);
        db.update("""
                insert into platform_client (clinic_id, legal_name, contact_name, contact_email, contact_phone, city, internal_notes, source)
                values (?, ?, ?, ?, ?, ?, ?, 'MANUAL')
                on conflict (clinic_id) do update set legal_name = excluded.legal_name, contact_name = excluded.contact_name,
                    contact_email = excluded.contact_email, contact_phone = excluded.contact_phone, city = excluded.city,
                    internal_notes = excluded.internal_notes, updated_at = now()""",
                id, blank(req.legalName()), blank(req.contactName()), blank(req.contactEmail()), blank(req.contactPhone()),
                blank(req.city()), blank(req.internalNotes()));

        // Solo se auditan los campos que realmente cambiaron (sin copiar las notas internas completas).
        var changes = new java.util.LinkedHashMap<String, Object>();
        diff(changes, "Nombre", before.name(), req.clinicName().trim());
        diff(changes, "NIT", before.nit(), blank(req.nit()));
        diff(changes, "Razón social", b.legalName(), blank(req.legalName()));
        diff(changes, "Contacto", b.contactName(), blank(req.contactName()));
        diff(changes, "Correo de contacto", b.contactEmail(), blank(req.contactEmail()));
        diff(changes, "Teléfono", b.contactPhone(), blank(req.contactPhone()));
        diff(changes, "Ciudad", b.city(), blank(req.city()));
        if (!Objects.equals(b.internalNotes(), blank(req.internalNotes()))) changes.put("Notas internas", "modificadas");
        if (!changes.isEmpty()) {
            audit.record(me, "CLIENT_UPDATED", id, "Actualizó los datos del cliente", Views.details("changes", changes));
        }
        return detail(id);
    }

    @Transactional
    public ClinicDetail setModules(AuthUser me, UUID id, Set<AppModule> requested, String reason) {
        var sub = entitlements.find(id).orElseThrow(() -> new NotFoundException("Cliente no encontrado"));
        var problems = AppModule.dependencyProblems(requested);
        if (!problems.isEmpty()) throw new BadRequestException(String.join(" ", problems));
        if (requested.equals(sub.modules())) return detail(id);
        db.update("update clinic_subscription set modules = ?::varchar[], updated_at = now() where clinic_id = ?",
                PlanCatalog.pgArray(requested), id);
        var added = names(requested, sub.modules());
        var removed = names(sub.modules(), requested);
        audit.record(me, "MODULES_CHANGED", id, "Cambió los módulos del cliente",
                Views.details("added", added, "removed", removed, "after", names(requested, Set.of()), "reason", blank(reason)));
        return detail(id);
    }

    private static List<String> names(Set<AppModule> from, Set<AppModule> except) {
        return from.stream().filter(m -> !except.contains(m)).map(Enum::name).sorted().toList();
    }

    private static void diff(java.util.Map<String, Object> changes, String field, String before, String after) {
        if (!Objects.equals(before, after)) changes.put(field, Views.details("de", before, "a", after));
    }

    private long count(String sql, Object arg) {
        Long n = db.queryForObject(sql, Long.class, arg);
        return n == null ? 0 : n;
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static Instant instant(Timestamp t) {
        return t == null ? null : t.toInstant();
    }

    private static Instant epoch(Object ms) {
        return ms == null ? null : Instant.ofEpochMilli(((Number) ms).longValue());
    }
}
