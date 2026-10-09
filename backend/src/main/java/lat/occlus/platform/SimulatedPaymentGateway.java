package lat.occlus.platform;

import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Pasarela de pruebas: aprueba todo cobro salvo los de tokens que contengan «fail». No contacta a
 * ningún servicio externo ni mueve dinero.
 */
@Component
class SimulatedPaymentGateway implements PaymentGateway {

    @Override
    public String provider() {
        return "SIMULATED";
    }

    @Override
    public ChargeResult charge(ChargeRequest request) {
        if (request.tokenRef().toLowerCase().contains("fail")) {
            return new ChargeResult(false, null, "Cobro rechazado (simulado)");
        }
        return new ChargeResult(true, "sim-" + UUID.randomUUID(), null);
    }
}
