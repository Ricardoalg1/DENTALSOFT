package lat.occlus.platform;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Contratos del panel de plataforma. Nada de aquí incluye información clínica: solo datos
 * comerciales, de suscripción y conteos agregados.
 */
public final class PlatformDtos {

    private PlatformDtos() {}

    // ---------- Catálogo ----------

    public record ModuleInfo(String key, String label, String description, List<String> requires) {}

    public record PlanDto(String code, String name, Integer maxUsers, BigDecimal priceMonthly, BigDecimal priceAnnual,
                          List<String> modules, boolean active, int sortOrder) {}

    public record PlanUpdate(
            @NotBlank @Size(max = 60) String name,
            @Positive Integer maxUsers,
            @DecimalMin("0") BigDecimal priceMonthly,
            @DecimalMin("0") BigDecimal priceAnnual,
            @NotNull Set<AppModule> modules,
            boolean active) {}

    // ---------- Resumen ----------

    public record StatusCounts(long total, long trial, long active, long pastDue, long suspended, long cancelled) {}

    public record ClinicAlert(UUID clinicId, String clinicName, String status, Instant date, BigDecimal amount) {}

    public record Overview(
            String gatewayMode, java.util.List<String> checkoutProviders, java.util.List<String> cardProviders, boolean schedulerEnabled, int graceDays, StatusCounts clinics,
            /** Ingreso mensual recurrente: suscripciones activas o en mora, con el anual dividido en 12. */
            BigDecimal mrr, BigDecimal arr,
            List<ClinicAlert> trialsEnding, List<ClinicAlert> pastDue, List<ClinicAlert> renewalsUpcoming,
            long unreadNotifications, List<EventRow> recentEvents) {}

    // ---------- Clientes ----------

    public record ClinicRow(
            UUID id, String name, String nit, String city, String contactName, String contactEmail,
            String planCode, String planName, String status, String billingCycle, BigDecimal price,
            List<String> modules, long usersActive, Integer maxUsers, long patients,
            Instant trialEndsAt, Instant currentPeriodEnd, Instant createdAt, Instant lastActivityAt) {}

    public record ClientProfile(String legalName, String contactName, String contactEmail, String contactPhone,
                                String city, String internalNotes, String source) {}

    public record SubscriptionView(
            String planCode, String planName, String status, String billingCycle, BigDecimal price, Integer maxUsers,
            List<String> modules, Instant trialEndsAt, Instant currentPeriodStart, Instant currentPeriodEnd,
            boolean cancelAtPeriodEnd, Instant pastDueSince, Instant suspendedAt, Instant cancelledAt,
            Instant accessUntil, boolean accessAllowed, boolean inGrace) {}

    public record PaymentMethodView(String provider, String label) {}

    /** Solo conteos: el panel no tiene acceso a datos de pacientes. */
    public record Usage(long usersActive, long usersTotal, long sites, long patients, long appointments30d,
                        long storageBytes, Instant lastActivityAt) {}

    public record AdminUser(UUID id, String email, String fullName, boolean active) {}

    public record ClinicDetail(UUID id, String name, String nit, Instant createdAt, ClientProfile client,
                               SubscriptionView subscription, PaymentMethodView paymentMethod, Usage usage,
                               List<AdminUser> admins) {}

    public record ClientProfileUpdate(
            @NotBlank @Size(max = 150) String clinicName,
            @Size(max = 20) String nit,
            @Size(max = 150) String legalName,
            @Size(max = 150) String contactName,
            @Email @Size(max = 160) String contactEmail,
            @Size(max = 30) String contactPhone,
            @Size(max = 80) String city,
            @Size(max = 2000) String internalNotes) {}

    public record CreateClientRequest(
            @NotBlank @Size(max = 150) String clinicName,
            @Size(max = 20) String nit,
            @Size(max = 150) String legalName,
            @Size(max = 150) String contactName,
            @Email @Size(max = 160) String contactEmail,
            @Size(max = 30) String contactPhone,
            @Size(max = 80) String city,
            @Size(max = 2000) String notes,
            @NotBlank @Size(max = 150) String adminName,
            @NotBlank @Email @Size(max = 160) String adminEmail,
            @NotBlank @Size(max = 20) String planCode,
            @NotNull BillingCycle billingCycle,
            /** null = precio de lista del plan (obligatorio si el plan se cotiza). */
            @DecimalMin("0") BigDecimal price,
            @Positive Integer maxUsers,
            /** null o vacío = los módulos del plan. */
            Set<AppModule> modules,
            /** Días de prueba sin cobro; 0 = empieza pagando (exige referencia del pago). */
            @NotNull @Min(0) @Max(90) Integer trialDays,
            @Size(max = 200) String paymentReference,
            /** Solicitud del CRM de la que viene el cliente: queda marcada como ganada. */
            UUID leadId) {}

    /** La contraseña temporal se muestra UNA vez: no se guarda ni se vuelve a poder consultar. */
    public record CreatedClient(UUID clinicId, String adminEmail, String temporaryPassword) {}

    // ---------- Acciones sobre la suscripción ----------

    public record ModulesUpdate(@NotNull Set<AppModule> modules, @Size(max = 300) String reason) {}

    public record PlanChange(
            @NotBlank @Size(max = 20) String planCode,
            @NotNull BillingCycle billingCycle,
            @DecimalMin("0") BigDecimal price,
            @Positive Integer maxUsers,
            /** true = reemplaza los módulos del cliente por los del plan nuevo. */
            Boolean resetModules) {

        public boolean reset() {
            return Boolean.TRUE.equals(resetModules);
        }
    }

    public record ExtendTrial(@Min(1) @Max(90) int days, @NotBlank @Size(min = 3, max = 300) String reason) {}

    public record ReasonRequest(@NotBlank @Size(min = 3, max = 300) String reason) {}

    public record CancelRequest(Boolean immediately, @NotBlank @Size(min = 3, max = 300) String reason) {

        public boolean now() {
            return Boolean.TRUE.equals(immediately);
        }
    }

    public record ReactivateRequest(@Min(1) @Max(60) int courtesyDays, @NotBlank @Size(min = 3, max = 300) String reason) {}

    /** Token emitido por la pasarela (nunca datos de tarjeta) y una etiqueta para reconocerlo. */
    public record PaymentMethodRequest(@Size(max = 20) String provider, @NotBlank @Size(max = 200) String tokenRef,
                                       @NotBlank @Size(max = 80) String label) {}

    public record ChargeView(UUID id, Instant periodStart, Instant periodEnd, BigDecimal amount, String status,
                             String method, int attempts, Instant nextAttemptAt, String reference,
                             String failureReason, Instant paidAt, Instant createdAt) {}

    /** Registra un pago recibido fuera de la pasarela (transferencia, consignación). */
    public record ManualPaymentRequest(@NotBlank @Size(min = 3, max = 200) String reference, UUID chargeId) {}

    public record RunSummary(int clinics, int attempts, int paid, int failed) {}

    // ---------- Registros ----------

    public record AuditRow(UUID id, Instant at, UUID actorId, String actorName, String action, UUID clinicId,
                           String clinicName, String summary, Object details, String requestId) {}

    public record EventRow(UUID id, Instant at, UUID clinicId, String clinicName, String kind, String severity,
                           String title, Object detail) {}

    public record NotificationRow(UUID id, Instant createdAt, Instant readAt, EventRow event) {}

    public record AnnouncementRequest(
            UUID clinicId,
            @NotBlank @Size(max = 120) String title,
            @NotBlank @Size(max = 1000) String body,
            @NotBlank @Size(max = 8) String level,
            Instant endsAt) {}

    public record AnnouncementRow(UUID id, UUID clinicId, String clinicName, String title, String body, String level,
                                  Instant startsAt, Instant endsAt, Instant createdAt, Instant archivedAt) {}

    /** Lo que ve una clínica. */
    public record ClinicAnnouncement(UUID id, String title, String body, String level) {}
}
