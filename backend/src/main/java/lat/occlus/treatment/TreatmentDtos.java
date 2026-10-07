package lat.occlus.treatment;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import lat.occlus.clinical.OdontogramCondition;
import lat.occlus.shared.web.Ref;

public final class TreatmentDtos {

    private TreatmentDtos() {}

    // ---------- Lista de precios ----------

    public record ProcedureRequest(
            @Size(max = 20) String code,
            @NotBlank @Size(max = 150) String name,
            @NotNull ProcedureCategory category,
            @Pattern(regexp = "[A-Za-z0-9]{0,10}", message = "Solo letras y números (hasta 10)") String cupsCode,
            @NotNull @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal price,
            boolean perTooth,
            OdontogramCondition treatsCondition,
            Boolean active) {}

    public record ProcedureResponse(
            UUID id, String code, String name, ProcedureCategory category, String cupsCode, BigDecimal price,
            boolean perTooth, OdontogramCondition treatsCondition, boolean active) {}

    // ---------- Planes ----------

    public record PlanRequest(
            @NotBlank @Size(max = 150) String title,
            @Size(max = 2000) String notes,
            LocalDate validUntil) {}

    public record ItemRequest(
            @NotNull UUID procedureId,
            @Min(11) @Max(85) Integer tooth,
            @Pattern(regexp = "[OMDVL]{1,5}", message = "Superficies: O, M, D, V, L") String surfaces,
            @Min(1) @Max(99) Integer quantity,
            @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal discount) {}

    /** Agregar varios ítems de una vez (p. ej. las sugerencias del odontograma). */
    public record ItemsRequest(@NotNull @Size(min = 1, max = 50) List<@Valid ItemRequest> items) {}

    public record ItemStatusRequest(@NotNull ItemStatus status) {}

    public record ItemResponse(
            UUID id, Ref procedure, String description, String cupsCode, Integer tooth, String surfaces,
            int quantity, BigDecimal unitPrice, BigDecimal discount, BigDecimal total,
            ItemStatus status, Instant doneAt, Ref doneBy) {}

    /** Totales del plan, sin contar ítems cancelados. */
    public record PlanTotals(BigDecimal total, BigDecimal done, BigDecimal pending) {}

    public record PlanResponse(
            UUID id, Ref patient, Ref dentist, String title, PlanStatus status, String notes, LocalDate validUntil,
            Instant acceptedAt, Ref acceptedBy, Instant closedAt, Instant createdAt,
            List<ItemResponse> items, PlanTotals totals) {}

    public record PlanSummary(
            UUID id, String title, PlanStatus status, Ref dentist, Instant createdAt, int itemCount, PlanTotals totals) {}

    /** Sugerencia a partir de un hallazgo vigente del odontograma. */
    public record Suggestion(
            int tooth, String surfaces, OdontogramCondition condition, UUID procedureId, String procedureName,
            BigDecimal price) {}
}
