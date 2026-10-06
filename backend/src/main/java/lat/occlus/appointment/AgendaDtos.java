package lat.occlus.appointment;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lat.occlus.patient.DocumentType;

public final class AgendaDtos {

    private AgendaDtos() {}

    public record AppointmentRequest(
            @NotNull UUID patientId,
            @NotNull UUID dentistId,
            @NotNull UUID siteId,
            @NotNull OffsetDateTime startsAt,
            @NotNull @Min(5) @Max(480) Integer durationMinutes,
            @Size(max = 200) String reason,
            @Size(max = 1000) String notes) {}

    public record StatusRequest(@NotNull AppointmentStatus status, @Size(max = 200) String cancellationReason) {}

    public record PatientRef(UUID id, String fullName, DocumentType documentType, String documentNumber, String phone) {}

    public record Ref(UUID id, String name) {}

    /** Las fechas salen en hora de Colombia (-05:00). */
    public record AppointmentResponse(
            UUID id, OffsetDateTime startsAt, OffsetDateTime endsAt, AppointmentStatus status,
            String reason, String notes, String cancellationReason,
            PatientRef patient, Ref dentist, Ref site) {}

    public record ScheduleBlock(
            @NotNull UUID siteId,
            @NotNull @Min(1) @Max(7) Integer dayOfWeek,
            @NotNull LocalTime startTime,
            @NotNull LocalTime endTime) {}

    public record ScheduleRequest(@NotNull @Size(max = 50) List<@Valid ScheduleBlock> blocks) {}

    public record ScheduleResponse(UUID dentistId, UUID siteId, int dayOfWeek, LocalTime startTime, LocalTime endTime) {}
}
