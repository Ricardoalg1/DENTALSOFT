package lat.occlus.cash;

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
import lat.occlus.shared.web.Ref;

public final class CashDtos {

    private CashDtos() {}

    public record OpenSessionRequest(
            @NotNull UUID siteId,
            @NotNull @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal openingAmount) {}

    public record CloseSessionRequest(
            @NotNull @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal countedCash,
            @Size(max = 500) String notes) {}

    /**
     * Registrar un ingreso. {@code kind} null = abono a cuenta (ACCOUNT), como los pagos de siempre.
     * En un recibo de venta (SALE) el valor sale del detalle ({@code items}); en un abono se digita ({@code amount}).
     * {@code incomeDate} null = hoy; {@code payerName}/{@code payerDocument} = a nombre de un tercero.
     */
    public record PaymentRequest(
            @NotNull UUID siteId,
            @DecimalMin(value = "0.01", message = "El valor debe ser mayor que cero")
            @Digits(integer = 12, fraction = 2) BigDecimal amount,
            @NotNull PaymentMethod method,
            @Size(max = 100) String reference,
            @Size(max = 300) String notes,
            UUID planId,
            PaymentKind kind,
            LocalDate incomeDate,
            UUID dentistId,
            @Size(max = 200) String payerName,
            @Size(max = 40) String payerDocument,
            @Size(max = 200) String concept,
            PaymentTerm paymentTerm,
            @Size(max = 100) List<@Valid @NotNull ItemRequest> items,
            /** Abono a las cuotas de un financiamiento del paciente. */
            UUID financingId) {}

    public record ItemRequest(
            UUID procedureId,
            @NotBlank @Size(max = 200) String description,
            @Pattern(regexp = "[A-Za-z0-9]{0,10}", message = "CUPS: solo letras y números (hasta 10)") String cupsCode,
            @NotNull @Min(1) @Max(999) Integer quantity,
            @Pattern(regexp = "[0-9]{2}", message = "Finalidad: código de 2 dígitos") String purpose,
            @NotNull @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal unitPrice,
            DiscountType discountType,
            @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal discountValue,
            @Size(max = 5) String diagnosisMain,
            @Size(max = 5) String diagnosisRelated) {}

    public record ItemResponse(
            int position, Ref procedure, String description, String cupsCode, int quantity, String purpose,
            BigDecimal unitPrice, BigDecimal subtotal, DiscountType discountType, BigDecimal discountValue,
            BigDecimal discount, BigDecimal total, String diagnosisMain, String diagnosisRelated) {}

    public record VoidRequest(@NotBlank @Size(max = 300) String reason) {}

    public record PaymentResponse(
            UUID id, long receiptNumber, Ref patient, String patientDocument, Ref plan, Ref site, UUID cashSessionId,
            BigDecimal amount, PaymentMethod method, String reference, String notes,
            Ref receivedBy, Instant receivedAt, Instant voidedAt, Ref voidedBy, String voidReason,
            String clinicName, String clinicNit,
            PaymentKind kind, LocalDate incomeDate, Ref dentist, String payerName, String payerDocument,
            String concept, PaymentTerm paymentTerm, List<ItemResponse> items, UUID financingId) {}

    // ---------- Gastos ----------

    public record ExpenseRequest(
            @NotNull UUID siteId,
            LocalDate expenseDate,
            @NotNull ExpenseCategory category,
            @NotBlank @Size(max = 300) String description,
            @Size(max = 200) String supplierName,
            @Size(max = 40) String supplierDocument,
            @Size(max = 60) String invoiceNumber,
            @NotNull @DecimalMin(value = "0.01", message = "El valor debe ser mayor que cero")
            @Digits(integer = 12, fraction = 2) BigDecimal amount,
            @NotNull PaymentMethod method,
            @Size(max = 100) String reference,
            /** Pagado con efectivo de la caja abierta de la sede. */
            Boolean fromCash) {}

    public record ExpenseResponse(
            UUID id, Ref site, UUID cashSessionId, LocalDate expenseDate, ExpenseCategory category, String description,
            String supplierName, String supplierDocument, String invoiceNumber, BigDecimal amount, PaymentMethod method,
            String reference, Ref createdBy, Instant createdAt, Instant voidedAt, Ref voidedBy, String voidReason) {}

    // ---------- Financiamiento ----------

    public record FinancingRequest(
            UUID planId,
            @NotBlank @Size(max = 200) String concept,
            @NotNull @DecimalMin(value = "0.01", message = "El valor debe ser mayor que cero")
            @Digits(integer = 12, fraction = 2) BigDecimal totalAmount,
            @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal downPayment,
            @NotNull @Min(1) @Max(60) Integer installments,
            @NotNull FinancingFrequency frequency,
            @NotNull LocalDate firstDue,
            @Size(max = 500) String notes) {}

    public enum FinancingStatus { ACTIVE, OVERDUE, PAID, CANCELLED }

    public enum InstallmentStatus { PAID, PARTIAL, PENDING, OVERDUE }

    /** Cuota 0 = cuota inicial (vence el día del acuerdo). */
    public record InstallmentResponse(int number, LocalDate dueDate, BigDecimal amount, BigDecimal paid, InstallmentStatus status) {}

    public record FinancingResponse(
            UUID id, Ref patient, String patientDocument, Ref plan, String concept,
            BigDecimal totalAmount, BigDecimal downPayment, int installments, FinancingFrequency frequency, LocalDate firstDue,
            String notes, Ref createdBy, Instant createdAt, Instant cancelledAt, Ref cancelledBy, String cancelReason,
            BigDecimal paid, BigDecimal balance, BigDecimal overdue, FinancingStatus status, LocalDate nextDue,
            List<InstallmentResponse> schedule) {}

    public record MethodTotal(PaymentMethod method, int count, BigDecimal total) {}

    /**
     * Turno de caja. {@code expectedCash} = base + pagos en efectivo − gastos pagados desde la caja (no anulados); al cerrar se compara
     * con lo contado ({@code difference} = contado − esperado: negativo es faltante).
     */
    public record SessionResponse(
            UUID id, Ref site, Ref openedBy, Instant openedAt, BigDecimal openingAmount,
            Ref closedBy, Instant closedAt, BigDecimal expectedCash, BigDecimal countedCash, BigDecimal difference,
            String notes, List<MethodTotal> totals, BigDecimal collected, int voidedCount,
            /** Efectivo que salió de la caja para gastos. */
            BigDecimal cashExpenses,
            /** Solo en el detalle. */
            List<PaymentResponse> payments) {}

    /** Estado de cuenta: realizado − pagado. Saldo negativo = anticipo a favor del paciente. */
    public record AccountResponse(BigDecimal budgeted, BigDecimal done, BigDecimal pendingToDo, BigDecimal paid,
                                  BigDecimal balance) {}
}
