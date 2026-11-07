package lat.occlus.booking;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lat.occlus.appointment.VisitType;

public final class BookingDtos {

    private BookingDtos() {}

    public record Ref(UUID id, String name) {}
    public record VisitOption(VisitType code, String label) {}

    // ---------- Público: nunca lleva datos de pacientes ni motivos ----------

    public record BookingInfo(String clinicName, List<Ref> dentists, List<VisitOption> visitTypes, int durationMinutes,
                              List<String> channels, String consentVersion, String consentText, String captchaSiteKey) {}

    public record Slot(OffsetDateTime startsAt, UUID siteId, String siteName) {}

    public record HoldRequest(@NotNull UUID dentistId, @NotNull UUID siteId, @NotNull OffsetDateTime startsAt,
                              @NotNull VisitType visitType, @Size(max = 4096) String captchaToken) {}

    public record HoldResponse(String holdToken, Instant expiresAt) {}

    public record DetailsRequest(
            @NotBlank @Size(max = 100) String holdToken,
            @NotBlank @Size(min = 3, max = 120) String fullName,
            @NotBlank @Pattern(regexp = "[0-9 +()-]{7,20}", message = "Teléfono inválido") String phone,
            @NotBlank @Email @Size(max = 160) String email,
            @NotBlank @Pattern(regexp = "EMAIL|WHATSAPP") String channel,
            @NotBlank @Size(max = 30) String consentVersion,
            @NotNull Boolean consentAccepted) {}

    public record VerifyRequest(@NotBlank @Size(max = 100) String holdToken, @NotBlank @Size(max = 10) String code) {}

    public record VerifyResponse(String manageToken) {}

    public record TokenRequest(@NotBlank @Size(max = 100) String token) {}

    public record ManageSlotsRequest(@NotBlank @Size(max = 100) String token, @NotNull java.time.LocalDate from) {}

    public record RescheduleRequest(@NotBlank @Size(max = 100) String token, @NotNull UUID siteId, @NotNull OffsetDateTime startsAt) {}

    public record ManageView(String clinicName, String status, OffsetDateTime startsAt, String dentistName, String siteName, String visitType) {}

    // ---------- Clínica ----------

    public record SettingsRequest(
            boolean enabled,
            @NotBlank @Size(min = 3, max = 60) @Pattern(regexp = "[a-z0-9]+(-[a-z0-9]+)*", message = "Solo minúsculas, números y guiones") String slug,
            @NotNull @Size(max = 4) List<VisitType> visitTypes,
            @NotNull @Size(max = 200) List<UUID> dentistIds,
            @Min(10) @Max(240) int durationMinutes,
            @Min(0) @Max(720) int minNoticeHours,
            @Min(1) @Max(90) int maxDaysAhead) {}

    public record SettingsResponse(boolean enabled, String slug, List<VisitType> visitTypes, List<UUID> dentistIds,
                                   int durationMinutes, int minNoticeHours, int maxDaysAhead, String publicUrl,
                                   boolean captchaReady, boolean mailReady) {}

    public record PatientMatch(UUID id, String fullName, String document) {}

    public record RequestView(UUID id, OffsetDateTime startsAt, OffsetDateTime endsAt, String visitType, String fullName,
                              String phone, String email, String verifiedChannel, Ref dentist, Ref site,
                              UUID patientId, List<PatientMatch> matches) {}

    public record ConfirmRequest(@NotNull UUID patientId) {}

    public record RejectRequest(@Size(max = 200) String reason) {}

    public record PendingCount(int pending) {}
}
