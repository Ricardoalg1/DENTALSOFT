package lat.occlus.clinical;
import java.util.*;
import jakarta.validation.Valid;
import lat.occlus.platform.*;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.PageResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
@RestController @RequiredArgsConstructor @RequiresModule(AppModule.CLINICAL_RECORD) @PreAuthorize(ClinicalAccess.CAN_READ)
public class PrescriptionController {
 private final PrescriptionService service;
 @GetMapping("/api/patients/{patient}/prescriptions") public PageResponse<PrescriptionService.Response> list(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID patient,@RequestParam(defaultValue="0") int page){return service.list(AuthUser.from(jwt),patient,page);}
 @PostMapping("/api/patients/{patient}/prescriptions") @ResponseStatus(HttpStatus.CREATED) public PrescriptionService.Response create(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID patient,@Valid @RequestBody PrescriptionService.Request req){return service.create(AuthUser.from(jwt),patient,req);}
 @GetMapping("/api/prescriptions/{id}") public PrescriptionService.Response get(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id){return service.get(AuthUser.from(jwt),id);}
 @PutMapping("/api/prescriptions/{id}") public PrescriptionService.Response update(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@Valid @RequestBody PrescriptionService.Request req){return service.update(AuthUser.from(jwt),id,req);}
 public record SignRequest(boolean confirmed) {}
 @PostMapping("/api/prescriptions/{id}/sign") public PrescriptionService.Response sign(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@RequestBody SignRequest req){return service.sign(AuthUser.from(jwt),id,req.confirmed());}
 @GetMapping("/api/prescriptions/{id}/document.pdf") public ResponseEntity<byte[]> pdf(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id){return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF).cacheControl(CacheControl.noStore()).header("Content-Disposition","inline; filename=formula-medica.pdf").body(service.pdf(AuthUser.from(jwt),id));}
}
