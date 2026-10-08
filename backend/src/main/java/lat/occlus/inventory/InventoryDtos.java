package lat.occlus.inventory;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public final class InventoryDtos {
 private InventoryDtos() {}
 public enum Kind { ENTRY, CONSUMPTION, DISCARD, ADJUSTMENT, TRANSFER }
 public record ItemRequest(@NotBlank @Pattern(regexp="[A-Za-z0-9_-]{1,40}") String code,
  @NotBlank @Size(max=150) String name, @NotBlank @Size(max=30) String unit,
  @NotNull @DecimalMin("0") @Digits(integer=11,fraction=3) BigDecimal minimum,
  boolean trackLots, boolean active) {}
 public record Item(UUID id,String code,String name,String unit,BigDecimal minimum,boolean trackLots,boolean active) {}
 public record Stock(UUID batchId,UUID itemId,UUID siteId,String lot,LocalDate expiresOn,BigDecimal quantity) {}
 public record MovementRequest(@NotNull UUID operationId,@NotNull UUID itemId,@NotNull UUID siteId,
  @NotNull Kind kind,@NotNull @Digits(integer=11,fraction=3) BigDecimal quantity,
  @Size(max=80) String lot,LocalDate expiresOn,UUID destinationSiteId,
  @NotBlank @Size(min=3,max=300) String reason,@Size(max=100) String reference) {}
 public record Movement(UUID id,UUID operationId,UUID itemId,UUID siteId,String lot,
  String kind,BigDecimal delta,BigDecimal balance,String reason,String reference,
  String createdBy,Instant createdAt) {}
 public record Overview(java.util.List<Item> items,java.util.List<Stock> stock,java.util.List<Movement> movements) {}
}
