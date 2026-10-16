package lat.occlus.cash;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import lat.occlus.cash.CashDtos.ExpenseRequest;
import lat.occlus.cash.CashDtos.ExpenseResponse;
import lat.occlus.shared.access.StaffAccess;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.ConflictException;
import lat.occlus.shared.web.NotFoundException;
import lat.occlus.shared.web.PageResponse;
import lat.occlus.shared.web.Ref;
import lat.occlus.site.Site;
import lat.occlus.site.SiteRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Gastos de la clínica: registro, consulta por fechas y anulación. */
@Service
@RequiredArgsConstructor
public class ExpenseService {

    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");

    private final ExpenseRepository expenses;
    private final CashSessionRepository sessions;
    private final SiteRepository sites;
    private final StaffAccess access;
    private final JdbcTemplate jdbc;

    /**
     * Registra un gasto. {@code fromCash} = se paga con efectivo de la caja abierta de la sede (se descuenta del cuadre).
     */
    @Transactional
    public ExpenseResponse register(AuthUser me, ExpenseRequest req) {
        sites.findById(req.siteId()).filter(s -> s.getClinicId().equals(me.clinicId()) && s.isActive())
                .orElseThrow(() -> new BadRequestException("Sede no válida"));
        LocalDate today = LocalDate.now(BOGOTA);
        LocalDate date = req.expenseDate() == null ? today : req.expenseDate();
        if (date.isAfter(today)) throw new BadRequestException("La fecha del gasto no puede ser futura");
        boolean fromCash = Boolean.TRUE.equals(req.fromCash());
        if (fromCash && req.method() != PaymentMethod.CASH) {
            throw new BadRequestException("Solo un gasto en efectivo puede salir de la caja");
        }
        UUID sessionId = null;
        if (fromCash) {
            var session = sessions.findOpenLocked(me.clinicId(), req.siteId())
                    .orElseThrow(() -> new ConflictException("No hay una caja abierta en esa sede para sacar el efectivo"));
            sessionId = session.getId();
        }
        String supplierName = clean(req.supplierName());
        String supplierDocument = clean(req.supplierDocument());
        var e = new Expense();
        e.setId(UUID.randomUUID());
        e.setClinicId(me.clinicId());
        e.setSiteId(req.siteId());
        e.setCashSessionId(sessionId);
        e.setExpenseDate(date);
        e.setCategory(req.category());
        e.setDescription(req.description().trim());
        e.setSupplierName(supplierName);
        e.setSupplierDocument(supplierDocument);
        e.setInvoiceNumber(clean(req.invoiceNumber()));
        e.setAmount(req.amount());
        e.setMethod(req.method());
        e.setReference(clean(req.reference()));
        e.setCreatedBy(me.userId());
        return toResponses(List.of(expenses.saveAndFlush(e))).getFirst();
    }

    /** Anula un gasto (solo administradores). Si salió de una caja, esa caja debe seguir abierta. */
    @Transactional
    public ExpenseResponse voidExpense(AuthUser me, UUID id, String reason) {
        var e = expenses.findByIdAndClinicId(id, me.clinicId()).orElseThrow(() -> new NotFoundException("Gasto no encontrado"));
        if (e.isVoided()) throw new ConflictException("El gasto ya fue anulado");
        if (e.getCashSessionId() != null) {
            var session = sessions.findLocked(me.clinicId(), e.getCashSessionId()).orElseThrow();
            if (!session.isOpen()) throw new ConflictException("La caja de ese gasto ya se cerró: no se puede anular");
        }
        e.setVoidedAt(Instant.now());
        e.setVoidedBy(me.userId());
        e.setVoidReason(reason.trim());
        return toResponses(List.of(expenses.saveAndFlush(e))).getFirst();
    }

    @Transactional(readOnly = true)
    public PageResponse<ExpenseResponse> search(UUID clinicId, LocalDate from, LocalDate to, UUID siteId,
                                                ExpenseCategory category, String query, int page, int size) {
        if (page < 0 || page > 100000 || size < 1 || size > 100 || (query != null && query.length() > 120)) {
            throw new BadRequestException("Filtros de búsqueda inválidos");
        }
        if (from.isAfter(to)) throw new BadRequestException("La fecha inicial es posterior a la final");
        var where = new StringBuilder(" from expense e where e.clinic_id = ? and e.expense_date between ? and ?");
        var args = new ArrayList<Object>(List.of(clinicId, from, to));
        if (siteId != null) { where.append(" and e.site_id = ?"); args.add(siteId); }
        if (category != null) { where.append(" and e.category = ?"); args.add(category.name()); }
        if (query != null && !query.isBlank()) {
            where.append(" and concat_ws(' ', e.description, e.supplier_name, e.supplier_document, e.invoice_number) ilike ? escape '!'");
            args.add("%" + query.trim().replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%");
        }
        long count = jdbc.queryForObject("select count(*)" + where, Long.class, args.toArray());
        int pages = (int) Math.ceil((double) count / size);
        int actual = pages == 0 ? 0 : Math.min(page, pages - 1);
        args.add(size);
        args.add(actual * size);
        var ids = jdbc.queryForList("select e.id" + where + " order by e.expense_date desc, e.created_at desc limit ? offset ?",
                UUID.class, args.toArray());
        var byId = expenses.findAllById(ids).stream().collect(Collectors.toMap(Expense::getId, Function.identity()));
        return new PageResponse<>(toResponses(ids.stream().map(byId::get).filter(Objects::nonNull).toList()), actual, size, count, pages);
    }

    private List<ExpenseResponse> toResponses(List<Expense> list) {
        if (list.isEmpty()) return List.of();
        Map<UUID, String> siteNames = sites.findAllById(list.stream().map(Expense::getSiteId).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(Site::getId, Site::getName));
        var users = access.userRefs(list.stream().flatMap(e -> Stream.of(e.getCreatedBy(), e.getVoidedBy())).toList());
        return list.stream().map(e -> new ExpenseResponse(e.getId(), new Ref(e.getSiteId(), siteNames.get(e.getSiteId())),
                e.getCashSessionId(), e.getExpenseDate(), e.getCategory(), e.getDescription(), e.getSupplierName(),
                e.getSupplierDocument(), e.getInvoiceNumber(), e.getAmount(), e.getMethod(), e.getReference(),
                users.get(e.getCreatedBy()), e.getCreatedAt(), e.getVoidedAt(), users.get(e.getVoidedBy()), e.getVoidReason()))
                .toList();
    }

    private static String clean(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
