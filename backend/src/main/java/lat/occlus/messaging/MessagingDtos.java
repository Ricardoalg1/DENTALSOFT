package lat.occlus.messaging;

import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class MessagingDtos {
 private MessagingDtos() {}
 public record Settings(boolean remindersEnabled,@Min(2) @Max(72) int hoursBefore,boolean aiEnabled) {}
 public record Channel(boolean simulated,boolean aiAvailable,boolean schedulerEnabled,String message) {}
 public record MessageView(UUID id,UUID patientId,String patientName,UUID appointmentId,Instant appointmentStartsAt,
    String direction,String kind,String phone,String body,String status,boolean simulated,String deliveryStatus,
    String intent,String intentSource,String intentSummary,String action,boolean needsAttention,
    Instant resolvedAt,String resolutionNote,String error,Instant createdAt,String providerMessageId) {}
 public record Overview(Settings settings,Channel channel,List<MessageView> messages,int attentionCount) {}
 public record Simulation(@NotNull UUID reminderId,@NotBlank @Size(max=2000) String text) {}
 public record Resolution(@NotBlank @Size(min=3,max=300) String note) {}
 public record RunResult(int queued) {}
}
