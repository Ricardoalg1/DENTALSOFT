package lat.occlus.inventory;

import jakarta.validation.Valid;
import java.util.UUID;
import lat.occlus.inventory.InventoryDtos.Equipment;
import lat.occlus.inventory.InventoryDtos.EquipmentKind;
import lat.occlus.inventory.InventoryDtos.EquipmentRequest;
import lat.occlus.inventory.InventoryDtos.EquipmentStatus;
import lat.occlus.platform.AppModule;
import lat.occlus.platform.RequiresModule;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.PageResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Equipos (Inventario): todo el equipo los consulta; registrarlos y editarlos es del administrador. */
@RequiresModule(AppModule.INVENTORY)
@RestController
@RequiredArgsConstructor
public class EquipmentController {

    private final EquipmentService service;

    @GetMapping("/api/equipment")
    PageResponse<Equipment> search(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) String q,
            @RequestParam(required = false) EquipmentKind kind, @RequestParam(required = false) EquipmentStatus status,
            @RequestParam(required = false) UUID siteId, @RequestParam(defaultValue = "false") boolean includeRetired,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return service.search(AuthUser.from(jwt).clinicId(), q, kind, status, siteId, includeRetired, page, size);
    }

    @GetMapping("/api/equipment/{id}")
    Equipment get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return service.get(AuthUser.from(jwt).clinicId(), id);
    }

    @PostMapping("/api/equipment")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    Equipment create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody EquipmentRequest req) {
        return service.save(AuthUser.from(jwt).clinicId(), null, req);
    }

    @PutMapping("/api/equipment/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    Equipment update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody EquipmentRequest req) {
        return service.save(AuthUser.from(jwt).clinicId(), id, req);
    }
}
