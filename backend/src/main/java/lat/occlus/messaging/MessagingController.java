package lat.occlus.messaging;

import lat.occlus.platform.AppModule;
import lat.occlus.platform.RequiresModule;

import jakarta.validation.Valid;
import java.util.UUID;
import lat.occlus.shared.security.AuthUser;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RequiresModule(AppModule.MESSAGING)
@RestController @RequestMapping("/api/messaging") @RequiredArgsConstructor
@PreAuthorize("hasAnyRole('ADMIN','RECEPTION')")
public class MessagingController {
 private final MessagingService messages;
 private final MessagingWorker worker;
 @GetMapping public MessagingDtos.Overview overview(@AuthenticationPrincipal Jwt jwt){return messages.overview(AuthUser.from(jwt).clinicId());}
 @PutMapping("/settings") @PreAuthorize("hasRole('ADMIN')")
 public MessagingDtos.Settings settings(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody MessagingDtos.Settings r){return messages.saveSettings(AuthUser.from(jwt),r);}
 @PostMapping("/run") public MessagingDtos.RunResult run(@AuthenticationPrincipal Jwt jwt){var clinic=AuthUser.from(jwt).clinicId();int n=messages.queueReminders(clinic);worker.drain(clinic);return new MessagingDtos.RunResult(n);}
 @PostMapping("/simulate") @ResponseStatus(HttpStatus.CREATED)
 public UUID simulate(@AuthenticationPrincipal Jwt jwt,@Valid @RequestBody MessagingDtos.Simulation r){var clinic=AuthUser.from(jwt).clinicId();var id=messages.simulate(clinic,r);worker.drain(clinic);return id;}
 @PostMapping("/messages/{id}/resolve") @ResponseStatus(HttpStatus.NO_CONTENT)
 public void resolve(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id,@Valid @RequestBody MessagingDtos.Resolution r){messages.resolve(AuthUser.from(jwt),id,r);}
}
