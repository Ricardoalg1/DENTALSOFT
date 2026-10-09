package lat.occlus.platform;

import java.util.HashMap;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Webhooks de las pasarelas. Son públicos (sin JWT): la autenticidad la da la firma, y aun así el
 * resultado se confirma consultando a la pasarela. Firma inválida: 401. Error al procesar: 500, para
 * que la pasarela reintente.
 */
@Slf4j
@RestController
@SkipEntitlements
@RequestMapping("/api/webhooks")
@RequiredArgsConstructor
class PaymentWebhookController {

    private final PaymentGateways gateways;
    private final CheckoutService checkout;

    @PostMapping("/wompi")
    ResponseEntity<Void> wompi(@RequestBody String raw, @RequestHeader HttpHeaders headers) {
        Map<String, String> flat = new HashMap<>();
        headers.forEach((k, v) -> flat.put(k.toLowerCase(), v.isEmpty() ? "" : v.getFirst()));
        return handle("WOMPI", new HostedCheckout.WebhookInput(raw, Map.of(), flat));
    }

    /** ePayco confirma por POST (formulario); se acepta también GET por si el comercio lo configuró así. */
    @RequestMapping(value = "/epayco", method = {RequestMethod.POST, RequestMethod.GET})
    ResponseEntity<Void> epayco(@RequestParam Map<String, String> params) {
        return handle("EPAYCO", new HostedCheckout.WebhookInput("", params, Map.of()));
    }

    private ResponseEntity<Void> handle(String provider, HostedCheckout.WebhookInput input) {
        var gateway = gateways.hostedAnyState(provider).filter(HostedCheckout::enabled);
        if (gateway.isEmpty()) return ResponseEntity.notFound().build();
        try {
            gateway.get().verifyWebhook(input).ifPresent(event -> checkout.onWebhook(gateway.get(), event));
            return ResponseEntity.ok().build();
        } catch (HostedCheckout.InvalidSignatureException e) {
            log.warn("Webhook de {} con firma inválida", provider);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
    }
}
