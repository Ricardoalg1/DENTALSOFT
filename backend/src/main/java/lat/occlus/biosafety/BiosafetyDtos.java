package lat.occlus.biosafety;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lat.occlus.shared.web.Ref;

public final class BiosafetyDtos {

    private BiosafetyDtos() {}

    /** {@code responsibleId} null = quien registra; {@code recordDate} null = hoy. */
    public record RecordRequest(
            @NotNull UUID siteId,
            @NotNull BiosafetyKind kind,
            LocalDate recordDate,
            UUID responsibleId,
            @NotNull @Size(max = 20) Map<String, Object> data,
            @Size(max = 500) String notes) {}

    public record VoidRequest(@NotBlank @Size(max = 300) String reason) {}

    /** {@code alert}: hallazgo que requiere acción (indicador no conforme, temperatura fuera de rango…). */
    public record RecordResponse(
            UUID id, Ref site, BiosafetyKind kind, LocalDate recordDate, Ref responsible, Map<String, Object> data,
            String notes, Ref createdBy, Instant createdAt, Instant voidedAt, Ref voidedBy, String voidReason, String alert) {}

    public record KindCount(BiosafetyKind kind, long last30Days, LocalDate lastRecord) {}

    /** Mantenimientos cuyo próximo vencimiento ya pasó o llega en los próximos 30 días (último registro por equipo). */
    public record MaintenanceDue(String equipment, Ref site, LocalDate nextDue, boolean overdue) {}

    public record Summary(List<KindCount> counts, List<RecordResponse> alerts, List<MaintenanceDue> maintenanceDue) {}
}
