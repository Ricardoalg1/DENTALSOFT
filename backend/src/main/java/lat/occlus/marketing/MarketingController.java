package lat.occlus.marketing;

import jakarta.validation.Valid;
import java.util.Map;
import java.util.UUID;
import lat.occlus.shared.security.AuthUser;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController @RequiredArgsConstructor
public class MarketingController {
 private final MarketingService marketing;
 @PostMapping("/api/public/demo-requests") @ResponseStatus(HttpStatus.ACCEPTED)
 public void create(@RequestHeader(value="X-Occlus-Public-Key",required=false) String key,@Valid @RequestBody MarketingDtos.DemoRequest r){marketing.create(key,r);}
 @PostMapping("/api/public/site-events") @ResponseStatus(HttpStatus.NO_CONTENT)
 public void event(@RequestHeader(value="X-Occlus-Public-Key",required=false) String key,@Valid @RequestBody MarketingDtos.Event r){marketing.event(key,r.path());}
 @GetMapping("/api/marketing/access") public Map<String,Boolean> access(@AuthenticationPrincipal Jwt jwt){return Map.of("allowed",marketing.allowed(AuthUser.from(jwt)));}
 @GetMapping("/api/marketing/leads") public MarketingDtos.Crm overview(@AuthenticationPrincipal Jwt jwt,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="") String status,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="25") int size,@RequestParam(defaultValue="false") boolean due){return marketing.overview(AuthUser.from(jwt),q,status,page,size,due);}
 @GetMapping("/api/marketing/leads/{id}") public MarketingDtos.Lead detail(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id){return marketing.detail(AuthUser.from(jwt),id);}
 @PutMapping("/api/marketing/leads/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
 public void update(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@Valid @RequestBody MarketingDtos.Update r){marketing.update(AuthUser.from(jwt),id,r);}
 @DeleteMapping("/api/marketing/leads/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
 public void erase(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@Valid @RequestBody MarketingDtos.Erasure request){marketing.erase(AuthUser.from(jwt),id);}
 @GetMapping("/api/marketing/leads/{id}/history") public java.util.List<MarketingDtos.Activity> history(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id){return marketing.history(AuthUser.from(jwt),id);}
}
