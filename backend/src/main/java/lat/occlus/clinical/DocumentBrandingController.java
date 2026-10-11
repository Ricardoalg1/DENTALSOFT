package lat.occlus.clinical;
import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lat.occlus.shared.security.AuthUser;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
@RestController @RequiredArgsConstructor
public class DocumentBrandingController {
 private final DocumentBrandingService service;
 public record BrandRequest(@NotNull @Size(max=300) String address,@NotNull @Size(max=80) String phone,@NotNull @Email @Size(max=200) String email) {}
 public record ProfileRequest(@NotNull @Size(max=120) String registration) {}
 @GetMapping("/api/clinic/document-branding") public DocumentBrandingService.Branding get(@AuthenticationPrincipal Jwt jwt) {return service.branding(AuthUser.from(jwt).clinicId());}
 @PutMapping("/api/clinic/document-branding") @PreAuthorize("hasRole('ADMIN')") public DocumentBrandingService.Branding save(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody BrandRequest req) {return service.saveBranding(AuthUser.from(jwt),req.address(),req.phone(),req.email());}
 @PostMapping("/api/clinic/document-branding/logo") @PreAuthorize("hasRole('ADMIN')") public Map<String,UUID> logo(@AuthenticationPrincipal Jwt jwt,@RequestParam MultipartFile file) {return Map.of("id",service.upload(AuthUser.from(jwt),file,true));}
 @DeleteMapping("/api/clinic/document-branding/logo") @PreAuthorize("hasRole('ADMIN')") @ResponseStatus(HttpStatus.NO_CONTENT) public void clearLogo(@AuthenticationPrincipal Jwt jwt) {service.clear(AuthUser.from(jwt),true);}
 @GetMapping("/api/users/me/document-profile") public DocumentBrandingService.Profile profile(@AuthenticationPrincipal Jwt jwt) {return service.profile(AuthUser.from(jwt));}
 @PutMapping("/api/users/me/document-profile") public DocumentBrandingService.Profile saveProfile(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody ProfileRequest req) {return service.saveProfile(AuthUser.from(jwt),req.registration());}
 @PostMapping("/api/users/me/document-profile/signature") public Map<String,UUID> signature(@AuthenticationPrincipal Jwt jwt,@RequestParam MultipartFile file,@RequestParam(defaultValue="false") boolean confirmed) {if(!confirmed)throw new lat.occlus.shared.web.BadRequestException("Confirma que esta firma te pertenece");return Map.of("id",service.upload(AuthUser.from(jwt),file,false));}
 @DeleteMapping("/api/users/me/document-profile/signature") @ResponseStatus(HttpStatus.NO_CONTENT) public void clearSignature(@AuthenticationPrincipal Jwt jwt) {service.clear(AuthUser.from(jwt),false);}
 @GetMapping("/api/document-assets/{id}") public ResponseEntity<byte[]> asset(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id) {return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).cacheControl(CacheControl.noStore()).header("X-Content-Type-Options","nosniff").body(service.image(AuthUser.from(jwt).clinicId(),id));}
}
