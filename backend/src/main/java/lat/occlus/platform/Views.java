package lat.occlus.platform;

import java.time.Duration;
import java.time.Instant;
import lat.occlus.platform.PlatformDtos.SubscriptionView;

/** Conversión de la suscripción guardada a lo que ve el panel. */
final class Views {

    private Views() {}

    static SubscriptionView subscription(Subscription s, Duration grace) {
        var access = s.access(Instant.now(), grace);
        return new SubscriptionView(s.planCode(), s.planName(), s.status().name(), s.billingCycle().name(), s.price(),
                s.maxUsers(), s.modules().stream().map(Enum::name).sorted().toList(), s.trialEndsAt(),
                s.currentPeriodStart(), s.currentPeriodEnd(), s.cancelAtPeriodEnd(), s.pastDueSince(), s.suspendedAt(),
                s.cancelledAt(), access.until(), access.allowed(), access.inGrace());
    }

    /** Escapa los comodines de LIKE para que lo que escribe el usuario se busque literalmente. */
    static String like(String q) {
        return "%" + q.trim().replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
    }

    static java.util.Map<String, Object> details(Object... keyValues) {
        var map = new java.util.LinkedHashMap<String, Object>();
        for (int i = 0; i < keyValues.length; i += 2) map.put((String) keyValues[i], keyValues[i + 1]);
        return map;
    }
}
