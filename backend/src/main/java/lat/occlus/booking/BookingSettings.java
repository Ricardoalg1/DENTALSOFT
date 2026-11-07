package lat.occlus.booking;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import lat.occlus.appointment.VisitType;

/** Configuración de la reserva en línea de una clínica. */
record BookingSettings(UUID clinicId, String slug, boolean enabled, List<VisitType> visitTypes, List<UUID> dentistIds,
                       int durationMinutes, int minNoticeHours, int maxDaysAhead) {

    static final String COLUMNS = """
            clinic_id, slug, enabled, array_to_string(visit_types, ',') as visit_types,
            array_to_string(dentist_ids, ',') as dentist_ids, duration_minutes, min_notice_hours, max_days_ahead""";

    static BookingSettings map(ResultSet rs, int row) throws SQLException {
        String types = rs.getString("visit_types");
        String dentists = rs.getString("dentist_ids");
        return new BookingSettings(rs.getObject("clinic_id", UUID.class), rs.getString("slug"), rs.getBoolean("enabled"),
                types == null || types.isBlank() ? List.of() : Arrays.stream(types.split(",")).map(VisitType::valueOf).toList(),
                dentists == null || dentists.isBlank() ? List.of() : Arrays.stream(dentists.split(",")).map(UUID::fromString).toList(),
                rs.getInt("duration_minutes"), rs.getInt("min_notice_hours"), rs.getInt("max_days_ahead"));
    }
}
