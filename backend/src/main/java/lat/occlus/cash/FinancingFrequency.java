package lat.occlus.cash;

import java.time.LocalDate;

/** Periodicidad de las cuotas de un financiamiento. */
public enum FinancingFrequency {
    WEEKLY, BIWEEKLY, MONTHLY;

    /** Vencimiento de la cuota {@code index} (0 = primera). */
    LocalDate due(LocalDate first, int index) {
        return switch (this) {
            case WEEKLY -> first.plusWeeks(index);
            case BIWEEKLY -> first.plusWeeks(2L * index);
            case MONTHLY -> first.plusMonths(index);
        };
    }
}
