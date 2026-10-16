package lat.occlus.biosafety;

import jakarta.validation.Valid;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;
import lat.occlus.biosafety.BiosafetyDtos.RecordRequest;
import lat.occlus.biosafety.BiosafetyDtos.RecordResponse;
import lat.occlus.biosafety.BiosafetyDtos.Summary;
import lat.occlus.biosafety.BiosafetyDtos.VoidRequest;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.PageResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Bioseguridad (núcleo, sin módulo): todo el equipo registra y consulta (el auxiliar esteriliza y limpia);
 * anular es solo del administrador.
 */
@RestController
@RequiredArgsConstructor
public class BiosafetyController {

    private final BiosafetyService service;

    @GetMapping("/api/biosafety")
    PageResponse<RecordResponse> search(@AuthenticationPrincipal Jwt jwt, @RequestParam(required = false) BiosafetyKind kind,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) UUID siteId,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "25") int size) {
        var today = LocalDate.now(ZoneId.of("America/Bogota"));
        return service.search(AuthUser.from(jwt).clinicId(), kind, from == null ? today.minusDays(30) : from,
                to == null ? today : to, siteId, page, size);
    }

    @GetMapping("/api/biosafety/summary")
    Summary summary(@AuthenticationPrincipal Jwt jwt) {
        return service.summary(AuthUser.from(jwt).clinicId());
    }

    /** Equipos del inventario para ligar un mantenimiento. */
    @GetMapping("/api/biosafety/equipment")
    java.util.List<java.util.Map<String, Object>> equipment(@AuthenticationPrincipal Jwt jwt) {
        return service.equipmentOptions(AuthUser.from(jwt).clinicId());
    }

    @PostMapping("/api/biosafety")
    @ResponseStatus(HttpStatus.CREATED)
    RecordResponse register(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody RecordRequest req) {
        return service.register(AuthUser.from(jwt), req);
    }

    @PostMapping("/api/biosafety/{id}/void")
    @PreAuthorize("hasRole('ADMIN')")
    RecordResponse voidRecord(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody VoidRequest req) {
        return service.voidRecord(AuthUser.from(jwt), id, req.reason());
    }
}
