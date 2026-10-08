package lat.occlus.inventory;

import jakarta.validation.Valid;
import java.util.UUID;
import lat.occlus.shared.security.AuthUser;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/inventory") @RequiredArgsConstructor
public class InventoryController {
 private final InventoryService inventory;
 @GetMapping public InventoryDtos.Overview overview(@AuthenticationPrincipal Jwt jwt) {return inventory.overview(AuthUser.from(jwt).clinicId());}
 @PostMapping("/items") @ResponseStatus(HttpStatus.CREATED) @PreAuthorize("hasRole('ADMIN')")
 public InventoryDtos.Item create(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody InventoryDtos.ItemRequest r){return inventory.save(AuthUser.from(jwt),null,r);}
 @PutMapping("/items/{id}") @PreAuthorize("hasRole('ADMIN')")
 public InventoryDtos.Item update(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@Valid @RequestBody InventoryDtos.ItemRequest r){return inventory.save(AuthUser.from(jwt),id,r);}
 @PostMapping("/movements") @ResponseStatus(HttpStatus.NO_CONTENT) @PreAuthorize("hasAnyRole('ADMIN','ASSISTANT')")
 public void move(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody InventoryDtos.MovementRequest r){inventory.move(AuthUser.from(jwt),r);}
}
