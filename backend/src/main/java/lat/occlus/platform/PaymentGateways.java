package lat.occlus.platform;

import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** Pasarelas disponibles: solo cuentan las activadas por configuración. */
@Component
@RequiredArgsConstructor
public class PaymentGateways {

    private final List<PaymentGateway> chargers;
    private final List<HostedCheckout> hosted;

    /** Para cobrar a un medio de pago guardado. */
    public Optional<PaymentGateway> charger(String provider) {
        return chargers.stream().filter(g -> g.enabled() && g.provider().equalsIgnoreCase(provider)).findFirst();
    }

    /** Para pagos con redirección. */
    public Optional<HostedCheckout> hosted(String provider) {
        return hosted.stream().filter(g -> g.enabled() && g.provider().equalsIgnoreCase(provider)).findFirst();
    }

    /** Aunque estén apagadas: los webhooks llegan por una ruta fija y se responden con 404 si no aplica. */
    public Optional<HostedCheckout> hostedAnyState(String provider) {
        return hosted.stream().filter(g -> g.provider().equalsIgnoreCase(provider)).findFirst();
    }

    public List<String> hostedProviders() {
        return hosted.stream().filter(HostedCheckout::enabled).map(HostedCheckout::provider).toList();
    }

    public List<String> cardOnFileProviders() {
        return chargers.stream().filter(PaymentGateway::enabled).map(PaymentGateway::provider).toList();
    }

    /** «simulated» (no mueve dinero), «live» (pasarela real) o «none» (solo pagos manuales). */
    public String mode(PaymentProperties props) {
        return props.anyLive() ? (props.simulated() ? "simulated+live" : "live") : props.simulated() ? "simulated" : "none";
    }
}
