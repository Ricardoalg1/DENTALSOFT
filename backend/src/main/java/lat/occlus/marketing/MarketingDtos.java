package lat.occlus.marketing;

import jakarta.validation.constraints.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class MarketingDtos {
 private MarketingDtos(){}
 public enum Status {NEW,CONTACTED,DEMO_SCHEDULED,WON,LOST}
 public record DemoRequest(@NotBlank @Size(max=120) String name,@NotBlank @Email @Size(max=160) String email,
  @Size(max=30) String phone,@NotBlank @Size(max=150) String clinicName,
  @NotBlank @Pattern(regexp="SOLO|TWO_TO_FIVE|SIX_TO_FIFTEEN|MORE") String teamSize,
  @NotBlank @Pattern(regexp="ESTANDAR|CRECIMIENTO|EXPANSION|INTERNACIONAL|UNDECIDED") String plan,
  @Size(max=800) String message,@AssertTrue boolean consent){}
 public record Lead(UUID id,String name,String email,String phone,String clinicName,String teamSize,
  String plan,String message,Status status,Instant createdAt,Instant updatedAt,LocalDate followUpOn){}
 public record Update(@NotNull Status status,@NotBlank @Size(min=3,max=1000) String note,LocalDate followUpOn){}
 public record Activity(UUID id,Status status,String note,String createdBy,Instant createdAt){}
 public record Metric(LocalDate day,String path,long views){}
 public record Count(Status status,long total){}
 public record Crm(List<Lead> leads,List<Count> counts,List<Metric> metrics,long total,int page,int size){}
 public record Erasure(@AssertTrue boolean confirmed){}
 public record Event(@NotBlank @Size(max=100) String path){}
}
