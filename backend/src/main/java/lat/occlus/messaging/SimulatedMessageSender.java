package lat.occlus.messaging;

import java.util.List;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;

/** Modo simulado: nada sale a internet; el mensaje queda registrado como SIMULATED. */
@Slf4j
class SimulatedMessageSender implements MessageSender {

    @Override
    public SendResult sendTemplate(String to, String template, String language, List<String> bodyParams) {
        log.debug("[WhatsApp simulado] plantilla registrada; no se realizó envío");
        return SendResult.ok("sim-" + UUID.randomUUID());
    }

    @Override
    public SendResult sendText(String to, String text) {
        log.debug("[WhatsApp simulado] respuesta registrada; no se realizó envío");
        return SendResult.ok("sim-" + UUID.randomUUID());
    }

    @Override
    public boolean simulated() {
        return true;
    }
}
