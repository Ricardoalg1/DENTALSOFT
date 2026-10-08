package lat.occlus.messaging;

import java.util.Optional;

/** Números de WhatsApp: el API de Meta los quiere solo con dígitos y con indicativo (57…). */
final class Phones {

    private Phones() {}

    /**
     * Celular colombiano → "573001234567". Por ahora solo móviles de Colombia (10 dígitos que
     * empiezan por 3, con o sin +57); un fijo o un número extranjero no recibe recordatorios.
     */
    static Optional<String> toWhatsApp(String raw) {
        if (raw == null) return Optional.empty();
        String digits = raw.replaceAll("\\D", "");
        if (digits.length() == 10 && digits.startsWith("3")) return Optional.of("57" + digits);
        if (digits.length() == 12 && digits.startsWith("573")) return Optional.of(digits);
        return Optional.empty();
    }
}
