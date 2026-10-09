package lat.occlus.platform;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lat.occlus.platform.PlatformDtos.ChargeView;
import lat.occlus.platform.PlatformDtos.PaymentMethodView;

/** Contratos de la suscripción vistos por la propia clínica (solo su administrador). */
public final class ClinicBillingDtos {

    private ClinicBillingDtos() {}

    public record State(String planCode, String planName, String status, String billingCycle, BigDecimal price,
                        Instant trialEndsAt, Instant currentPeriodEnd, boolean cancelAtPeriodEnd, boolean accessAllowed,
                        String inactiveMessage, Instant dueDate, boolean canPay, String cannotPayReason,
                        List<String> checkoutProviders, boolean cardOnFileAvailable, PaymentMethodView paymentMethod,
                        List<ChargeView> charges) {}

    public record StartCheckout(@NotBlank @Size(max = 20) String provider) {}

    public record RefreshCheckout(@Size(max = 120) String providerRef) {}

    public record CheckoutStarted(UUID checkoutId, String provider, String redirectUrl, Map<String, String> params) {}

    public record CheckoutResult(String status, String message) {}

    /** El token de tarjeta lo creó el navegador directamente con Wompi: aquí nunca llegan datos de tarjeta. */
    public record CardRequest(
            @NotBlank @Size(max = 200) String cardToken,
            @NotBlank @Size(max = 4000) String acceptanceToken,
            @NotBlank @Size(max = 4000) String personalAuthToken,
            @NotBlank @Pattern(regexp = "^[\\p{L}\\p{N} ·.\\-]{2,40}$", message = "Etiqueta inválida") String label) {}
}
