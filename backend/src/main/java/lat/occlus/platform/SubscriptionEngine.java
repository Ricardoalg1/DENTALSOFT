package lat.occlus.platform;

import java.time.Instant;
import java.util.UUID;
import lat.occlus.platform.PlatformDtos.RunSummary;
import lat.occlus.shared.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Renovaciones, cobros automáticos y suspensiones. Corre solo si {@code occlus.platform.scheduler-enabled}
 * está activo, o cuando el administrador lo ejecuta desde el panel.
 *
 * <p>Cada clínica se procesa de forma independiente: un error en una no detiene a las demás. Todo
 * es idempotente (un cobro por periodo, avisos con clave única), así que correrlo dos veces o desde
 * dos instancias es seguro.
 *
 * <p>La decisión de si una clínica tiene acceso NO depende de este proceso: se calcula por fechas
 * en {@link Subscription#access}. Este proceso solo actualiza estados, cobra y avisa.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class SubscriptionEngine {

    private final SubscriptionSteps steps;
    private final PaymentGateways gateways;
    private final PlatformProperties props;

    @Scheduled(fixedDelayString = "${occlus.platform.engine-interval:PT15M}", initialDelayString = "PT1M")
    public void scheduled() {
        if (!props.schedulerEnabled()) return;
        try {
            run(Instant.now());
        } catch (RuntimeException e) {
            log.error("Falló el ciclo de suscripciones", e);
        }
    }

    /** Llamar fuera de una transacción: cada paso abre la suya en modo sistema. */
    public RunSummary run(Instant now) {
        var clinics = TenantContext.callAsSystem(() -> steps.candidates(now));
        int processed = 0, attempts = 0, paid = 0, failed = 0;
        for (UUID clinic : clinics) {
            try {
                var due = TenantContext.callAsSystem(() -> steps.advance(clinic, now));
                processed++;
                for (UUID chargeId : due) {
                    var ticket = TenantContext.callAsSystem(() -> steps.begin(clinic, chargeId, now));
                    if (ticket == null) continue;
                    attempts++;
                    var result = charge(clinic, chargeId, ticket);
                    boolean ok = TenantContext.callAsSystem(() -> steps.finish(clinic, chargeId, ticket.attempt(), result, now));
                    if (ok) paid++;
                    else failed++;
                }
            } catch (RuntimeException e) {
                log.error("No se pudo procesar la suscripción de una clínica ({})", e.getClass().getSimpleName(), e);
            }
        }
        return new RunSummary(processed, attempts, paid, failed);
    }

    /** Llamada de red: sin transacción ni candado. La clave de idempotencia evita doble cobro si hay que repetir. */
    private PaymentGateway.ChargeResult charge(UUID clinic, UUID chargeId, SubscriptionSteps.Ticket ticket) {
        var gateway = gateways.charger(ticket.provider());
        if (gateway.isEmpty()) {
            return PaymentGateway.ChargeResult.declined("La pasarela «%s» no está activada en este entorno".formatted(ticket.provider()));
        }
        try {
            return gateway.get().charge(new PaymentGateway.ChargeRequest(clinic, chargeId, ticket.amount(), "COP",
                    ticket.tokenRef(), "sub-" + chargeId + "-" + ticket.attempt(), ticket.customerEmail()));
        } catch (RuntimeException e) {
            return PaymentGateway.ChargeResult.declined("La pasarela no respondió (" + e.getClass().getSimpleName() + ")");
        }
    }
}
