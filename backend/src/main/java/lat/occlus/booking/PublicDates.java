package lat.occlus.booking;

import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

final class PublicDates {

    private static final DateTimeFormatter FORMAT = DateTimeFormatter.ofPattern("EEEE d 'de' MMMM, h:mm a", Locale.forLanguageTag("es-CO"));

    private PublicDates() {}

    static String format(OffsetDateTime at) {
        return FORMAT.format(at.atZoneSameInstant(BookingSlots.BOGOTA));
    }
}
