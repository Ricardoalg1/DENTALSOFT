package lat.occlus.platform;

import java.time.Instant;
import java.time.ZoneId;

public enum BillingCycle {
    MONTHLY,
    ANNUAL;

    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");

    /** Fin de un periodo que empieza en {@code from} (calendario: 31 ene + 1 mes = 28/29 feb). */
    public Instant endOfPeriodStarting(Instant from) {
        var start = from.atZone(BOGOTA);
        return (this == MONTHLY ? start.plusMonths(1) : start.plusYears(1)).toInstant();
    }

    /** Valor mensual equivalente, para calcular ingresos recurrentes (MRR). */
    public java.math.BigDecimal monthlyEquivalent(java.math.BigDecimal price) {
        return this == MONTHLY ? price : price.divide(java.math.BigDecimal.valueOf(12), 2, java.math.RoundingMode.HALF_UP);
    }
}
