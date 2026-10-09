package lat.occlus.platform;

import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import lat.occlus.platform.PlatformDtos.AnnouncementRequest;
import lat.occlus.platform.PlatformDtos.AnnouncementRow;
import lat.occlus.platform.PlatformDtos.AuditRow;
import lat.occlus.platform.PlatformDtos.CancelRequest;
import lat.occlus.platform.PlatformDtos.ChargeView;
import lat.occlus.platform.PlatformDtos.ClientProfileUpdate;
import lat.occlus.platform.PlatformDtos.ClinicDetail;
import lat.occlus.platform.PlatformDtos.ClinicRow;
import lat.occlus.platform.PlatformDtos.CreateClientRequest;
import lat.occlus.platform.PlatformDtos.CreatedClient;
import lat.occlus.platform.PlatformDtos.EventRow;
import lat.occlus.platform.PlatformDtos.ExtendTrial;
import lat.occlus.platform.PlatformDtos.ManualPaymentRequest;
import lat.occlus.platform.PlatformDtos.ModuleInfo;
import lat.occlus.platform.PlatformDtos.ModulesUpdate;
import lat.occlus.platform.PlatformDtos.NotificationRow;
import lat.occlus.platform.PlatformDtos.Overview;
import lat.occlus.platform.PlatformDtos.PaymentMethodRequest;
import lat.occlus.platform.PlatformDtos.PlanChange;
import lat.occlus.platform.PlatformDtos.PlanDto;
import lat.occlus.platform.PlatformDtos.PlanUpdate;
import lat.occlus.platform.PlatformDtos.ReactivateRequest;
import lat.occlus.platform.PlatformDtos.ReasonRequest;
import lat.occlus.platform.PlatformDtos.RunSummary;
import lat.occlus.platform.PlatformDtos.SubscriptionView;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.PageResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Panel de administración de plataforma. Cada método pasa por {@link PlatformGate}, que exige estar
 * en la lista de administradores de plataforma, comprueba que el usuario siga activo y ejecuta en
 * modo sistema. Ninguna ruta devuelve datos clínicos.
 */
@RestController
@RequestMapping("/api/platform")
@SkipEntitlements
@RequiredArgsConstructor
public class PlatformController {

    private final PlatformGate gate;
    private final PlatformService service;
    private final ClientAdmin clients;
    private final SubscriptionAdmin subscriptions;
    private final PlatformFeeds feeds;
    private final SubscriptionEngine engine;
    private final PlatformAudit audit;

    private static AuthUser me(Jwt jwt) {
        return AuthUser.from(jwt);
    }

    // ---------- Resumen y catálogos ----------

    @GetMapping("/overview")
    Overview overview(@AuthenticationPrincipal Jwt jwt) {
        return gate.call(me(jwt), feeds::overview);
    }

    @GetMapping("/modules")
    List<ModuleInfo> modules(@AuthenticationPrincipal Jwt jwt) {
        return gate.call(me(jwt), feeds::modules);
    }

    @GetMapping("/plans")
    List<PlanDto> plans(@AuthenticationPrincipal Jwt jwt) {
        return gate.call(me(jwt), feeds::plans);
    }

    @PutMapping("/plans/{code}")
    PlanDto updatePlan(@AuthenticationPrincipal Jwt jwt, @PathVariable String code, @Valid @RequestBody PlanUpdate req) {
        return gate.call(me(jwt), () -> feeds.updatePlan(me(jwt), code, req));
    }

    // ---------- Clientes ----------

    @GetMapping("/clinics")
    PageResponse<ClinicRow> clinics(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) String q,
                                    @RequestParam(required = false) String status, @RequestParam(required = false) String plan,
                                    @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "25") int size) {
        return gate.call(me(jwt), () -> clients.list(q, status, plan, page, size));
    }

    @PostMapping("/clinics")
    @ResponseStatus(HttpStatus.CREATED)
    CreatedClient create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateClientRequest req) {
        return gate.call(me(jwt), () -> service.createClient(me(jwt), req));
    }

    @GetMapping("/clinics/{id}")
    ClinicDetail clinic(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return gate.call(me(jwt), () -> clients.detail(id));
    }

    @PutMapping("/clinics/{id}/client")
    ClinicDetail updateClient(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody ClientProfileUpdate req) {
        return gate.call(me(jwt), () -> clients.updateClient(me(jwt), id, req));
    }

    @PutMapping("/clinics/{id}/modules")
    ClinicDetail modules(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody ModulesUpdate req) {
        return gate.call(me(jwt), () -> clients.setModules(me(jwt), id, req.modules(), req.reason()));
    }

    // ---------- Suscripción ----------

    @PostMapping("/clinics/{id}/subscription/plan")
    SubscriptionView changePlan(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody PlanChange req) {
        return gate.call(me(jwt), () -> subscriptions.changePlan(me(jwt), id, req));
    }

    @PostMapping("/clinics/{id}/subscription/extend-trial")
    SubscriptionView extendTrial(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody ExtendTrial req) {
        return gate.call(me(jwt), () -> subscriptions.extendTrial(me(jwt), id, req.days(), req.reason()));
    }

    @PostMapping("/clinics/{id}/subscription/suspend")
    SubscriptionView suspend(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody ReasonRequest req) {
        return gate.call(me(jwt), () -> subscriptions.suspend(me(jwt), id, req.reason()));
    }

    @PostMapping("/clinics/{id}/subscription/reactivate")
    SubscriptionView reactivate(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody ReactivateRequest req) {
        return gate.call(me(jwt), () -> subscriptions.reactivate(me(jwt), id, req.courtesyDays(), req.reason()));
    }

    @PostMapping("/clinics/{id}/subscription/cancel")
    SubscriptionView cancel(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody CancelRequest req) {
        return gate.call(me(jwt), () -> subscriptions.cancel(me(jwt), id, req.now(), req.reason()));
    }

    @PostMapping("/clinics/{id}/subscription/resume")
    SubscriptionView resume(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return gate.call(me(jwt), () -> subscriptions.resume(me(jwt), id));
    }

    // ---------- Cobros ----------

    @PutMapping("/clinics/{id}/payment-method")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void setPaymentMethod(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody PaymentMethodRequest req) {
        gate.run(me(jwt), () -> subscriptions.setPaymentMethod(me(jwt), id, req.provider(), req.tokenRef(), req.label()));
    }

    @DeleteMapping("/clinics/{id}/payment-method")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void removePaymentMethod(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        gate.run(me(jwt), () -> subscriptions.removePaymentMethod(me(jwt), id));
    }

    @GetMapping("/clinics/{id}/charges")
    List<ChargeView> charges(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return gate.call(me(jwt), () -> subscriptions.charges(id));
    }

    @PostMapping("/clinics/{id}/payments")
    @ResponseStatus(HttpStatus.CREATED)
    ChargeView manualPayment(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody ManualPaymentRequest req) {
        return gate.call(me(jwt), () -> subscriptions.manualPayment(me(jwt), id, req.reference(), req.chargeId()));
    }

    /** Ejecuta ahora el proceso de renovaciones, cobros y suspensiones (el mismo del programador). */
    @PostMapping("/engine/run")
    RunSummary runEngine(@AuthenticationPrincipal Jwt jwt) {
        return gate.call(me(jwt), () -> {
            var summary = engine.run(Instant.now());
            audit.record(me(jwt), "ENGINE_RUN", null, "Ejecutó el proceso de suscripciones",
                    Views.details("clinics", summary.clinics(), "attempts", summary.attempts(), "paid", summary.paid(), "failed", summary.failed()));
            return summary;
        });
    }

    // ---------- Registros ----------

    @GetMapping("/audit")
    PageResponse<AuditRow> audit(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) UUID clinicId,
                                 @RequestParam(required = false) String action, @RequestParam(required = false) String q,
                                 @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "30") int size) {
        return gate.call(me(jwt), () -> feeds.audit(clinicId, action, q, page, size));
    }

    @GetMapping("/audit/actions")
    List<String> auditActions(@AuthenticationPrincipal Jwt jwt) {
        return gate.call(me(jwt), feeds::auditActions);
    }

    @GetMapping("/events")
    PageResponse<EventRow> events(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) UUID clinicId,
                                  @RequestParam(required = false) String severity,
                                  @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "30") int size) {
        return gate.call(me(jwt), () -> feeds.events(clinicId, severity, page, size));
    }

    // ---------- Notificaciones ----------

    @GetMapping("/notifications")
    PageResponse<NotificationRow> notifications(@AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue = "false") boolean unread,
                                                @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "30") int size) {
        return gate.call(me(jwt), () -> feeds.notifications(unread, page, size));
    }

    @PostMapping("/notifications/{id}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void markRead(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        gate.run(me(jwt), () -> feeds.markRead(me(jwt), id));
    }

    @PostMapping("/notifications/read-all")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void markAllRead(@AuthenticationPrincipal Jwt jwt) {
        gate.run(me(jwt), () -> feeds.markAllRead(me(jwt)));
    }

    // ---------- Avisos a las clínicas ----------

    @GetMapping("/announcements")
    List<AnnouncementRow> announcements(@AuthenticationPrincipal Jwt jwt) {
        return gate.call(me(jwt), feeds::announcements);
    }

    @PostMapping("/announcements")
    @ResponseStatus(HttpStatus.CREATED)
    void announce(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AnnouncementRequest req) {
        gate.run(me(jwt), () -> feeds.announce(me(jwt), req));
    }

    @PostMapping("/announcements/{id}/archive")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void archive(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        gate.run(me(jwt), () -> feeds.archiveAnnouncement(me(jwt), id));
    }
}
