package lat.occlus.dictation;

import lat.occlus.shared.security.AuthUser;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Dictado por voz en línea. Lo usan todos los campos de texto, así que es del núcleo y no de un módulo. */
@RestController
@RequestMapping("/api/dictation")
@RequiredArgsConstructor
public class DictationController {

    public record Text(String text) {}

    private final DictationService service;

    @GetMapping
    public DictationService.Status status(@AuthenticationPrincipal Jwt jwt) {
        return service.status(AuthUser.from(jwt).clinicId());
    }

    @PostMapping(path = "/transcribe", consumes = "audio/wav")
    public Text transcribe(@AuthenticationPrincipal Jwt jwt, @RequestBody byte[] audio) {
        return new Text(service.transcribe(AuthUser.from(jwt).clinicId(), audio));
    }
}
