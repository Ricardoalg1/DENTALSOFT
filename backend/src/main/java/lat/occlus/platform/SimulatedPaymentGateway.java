package lat.occlus.platform;

import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Pasarela de pruebas: aprueba todo cobro salvo los de tokens que contengan «fail». No contacta a
 * ningún servicio externo ni mueve dinero. Solo funciona con occlus.payments.simulated=true.
 */
@Component
@RequiredArgsConstructor
class SimulatedPaymentGateway implements PaymentGateway {

    private final PaymentProperties props;

    @Override
    public String provider() {
        return "SIMULATED";
    }

    @Override
    public boolean enabled() {
        return props.simulated();
    }

    @Override
    public ChargeResult charge(ChargeRequest request) {
        if (request.tokenRef().toLowerCase().contains("fail")) return ChargeResult.declined("Cobro rechazado (simulado)");
        return ChargeResult.approved("sim-" + UUID.randomUUID());
    }
}
