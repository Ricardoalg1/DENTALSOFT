package lat.occlus.patient;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import lat.occlus.platform.SkipEntitlements;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Público: el enlace «No quiero recibir más saludos» del correo de cumpleaños. */
@SkipEntitlements
@RestController
@RequiredArgsConstructor
public class BirthdayOptOutController {

    public record OptOutRequest(@Size(max = 100) String token) {}

    /** clinicName null = el enlace no es válido (o ya se usó y la autorización ya estaba retirada). */
    public record OptOutResult(String clinicName) {}

    private final BirthdayEmails emails;

    @PostMapping("/api/public/birthday-emails/optout")
    public OptOutResult optOut(@Valid @RequestBody OptOutRequest req) {
        return new OptOutResult(emails.optOut(req.token()).orElse(null));
    }
}
