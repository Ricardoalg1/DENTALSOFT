package lat.occlus.cash;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import lat.occlus.shared.web.Ref;

public final class CashDtos {

    private CashDtos() {}

    public record OpenSessionRequest(
            @NotNull UUID siteId,
            @NotNull @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal openingAmount) {}

    public record CloseSessionRequest(
            @NotNull @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal countedCash,
            @Size(max = 500) String notes) {}

    public record PaymentRequest(
            @NotNull UUID siteId,
            @NotNull @DecimalMin(value = "0.01", message = "El valor debe ser mayor que cero")
            @Digits(integer = 12, fraction = 2) BigDecimal amount,
            @NotNull PaymentMethod method,
            @Size(max = 100) String reference,
            @Size(max = 300) String notes,
            UUID planId) {}

    public record VoidRequest(@NotBlank @Size(max = 300) String reason) {}

    public record PaymentResponse(
            UUID id, long receiptNumber, Ref patient, String patientDocument, Ref plan, Ref site, UUID cashSessionId,
            BigDecimal amount, PaymentMethod method, String reference, String notes,
            Ref receivedBy, Instant receivedAt, Instant voidedAt, Ref voidedBy, String voidReason,
            String clinicName, String clinicNit) {}

    public record MethodTotal(PaymentMethod method, int count, BigDecimal total) {}

    /**
     * Turno de caja. {@code expectedCash} = base + pagos en efectivo no anulados; al cerrar se compara
     * con lo contado ({@code difference} = contado − esperado: negativo es faltante).
     */
    public record SessionResponse(
            UUID id, Ref site, Ref openedBy, Instant openedAt, BigDecimal openingAmount,
            Ref closedBy, Instant closedAt, BigDecimal expectedCash, BigDecimal countedCash, BigDecimal difference,
            String notes, List<MethodTotal> totals, BigDecimal collected, int voidedCount,
            /** Solo en el detalle. */
            List<PaymentResponse> payments) {}

    /** Estado de cuenta: realizado − pagado. Saldo negativo = anticipo a favor del paciente. */
    public record AccountResponse(BigDecimal budgeted, BigDecimal done, BigDecimal pendingToDo, BigDecimal paid,
                                  BigDecimal balance) {}
}
