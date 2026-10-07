package lat.occlus.cash;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Stream;
import lat.occlus.cash.CashDtos.MethodTotal;
import lat.occlus.cash.CashDtos.SessionResponse;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.ConflictException;
import lat.occlus.shared.web.NotFoundException;
import lat.occlus.shared.web.Ref;
import lat.occlus.shared.access.StaffAccess;
import lat.occlus.site.SiteRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CashService {

    private final CashSessionRepository sessions;
    private final PaymentRepository payments;
    private final SiteRepository sites;
    private final StaffAccess access;
    private final PaymentService paymentService;

    /** Últimos turnos (abiertos y cerrados) de la clínica, sin el detalle de pagos. */
    @Transactional(readOnly = true)
    public List<SessionResponse> recent(UUID clinicId) {
        return sessions.findByClinicIdOrderByOpenedAtDesc(clinicId, Limit.of(30)).stream()
                .map(s -> toResponse(s, false))
                .toList();
    }

    @Transactional(readOnly = true)
    public SessionResponse get(UUID clinicId, UUID id) {
        return toResponse(find(clinicId, id), true);
    }

    @Transactional
    public SessionResponse open(AuthUser me, UUID siteId, BigDecimal openingAmount) {
        sites.findById(siteId).filter(s -> s.getClinicId().equals(me.clinicId()) && s.isActive())
                .orElseThrow(() -> new BadRequestException("Sede no válida"));
        if (sessions.findByClinicIdAndSiteIdAndClosedAtIsNull(me.clinicId(), siteId).isPresent()) {
            throw new ConflictException("Ya hay una caja abierta en esa sede");
        }
        var s = new CashSession();
        s.setClinicId(me.clinicId());
        s.setSiteId(siteId);
        s.setOpenedBy(me.userId());
        s.setOpeningAmount(openingAmount);
        return toResponse(sessions.saveAndFlush(s), true);
    }

    /** Cierra el turno: guarda el efectivo esperado y el contado. Después no se puede modificar. */
    @Transactional
    public SessionResponse close(AuthUser me, UUID id, BigDecimal countedCash, String notes) {
        var s = find(me.clinicId(), id);
        if (!s.isOpen()) throw new ConflictException("La caja ya está cerrada");
        s.setExpectedCash(expectedCash(s, payments.findByCashSessionIdOrderByReceivedAtAsc(s.getId())));
        s.setCountedCash(countedCash);
        s.setNotes(notes == null || notes.isBlank() ? null : notes.trim());
        s.setClosedBy(me.userId());
        s.setClosedAt(Instant.now());
        return toResponse(sessions.saveAndFlush(s), true);
    }

    private CashSession find(UUID clinicId, UUID id) {
        return sessions.findByIdAndClinicId(id, clinicId).orElseThrow(() -> new NotFoundException("Caja no encontrada"));
    }

    private static BigDecimal expectedCash(CashSession s, List<Payment> list) {
        return s.getOpeningAmount().add(list.stream()
                .filter(p -> !p.isVoided() && p.getMethod() == PaymentMethod.CASH)
                .map(Payment::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add));
    }

    private SessionResponse toResponse(CashSession s, boolean withPayments) {
        var list = payments.findByCashSessionIdOrderByReceivedAtAsc(s.getId());
        var byMethod = new EnumMap<PaymentMethod, BigDecimal[]>(PaymentMethod.class);
        for (var p : list) {
            if (p.isVoided()) continue;
            var acc = byMethod.computeIfAbsent(p.getMethod(), m -> new BigDecimal[] {BigDecimal.ZERO, BigDecimal.ZERO});
            acc[0] = acc[0].add(BigDecimal.ONE);
            acc[1] = acc[1].add(p.getAmount());
        }
        var totals = new ArrayList<MethodTotal>();
        byMethod.forEach((m, acc) -> totals.add(new MethodTotal(m, acc[0].intValue(), acc[1])));
        BigDecimal collected = totals.stream().map(MethodTotal::total).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal expected = s.isOpen() ? expectedCash(s, list) : s.getExpectedCash();

        var users = access.userRefs(Stream.of(s.getOpenedBy(), s.getClosedBy()).filter(Objects::nonNull).toList());
        var site = sites.findById(s.getSiteId()).map(x -> new Ref(x.getId(), x.getName())).orElse(null);
        return new SessionResponse(s.getId(), site, users.get(s.getOpenedBy()), s.getOpenedAt(), s.getOpeningAmount(),
                users.get(s.getClosedBy()), s.getClosedAt(), expected, s.getCountedCash(),
                s.getCountedCash() == null ? null : s.getCountedCash().subtract(expected),
                s.getNotes(), totals, collected, (int) list.stream().filter(Payment::isVoided).count(),
                withPayments ? paymentService.toResponses(list) : null);
    }
}
