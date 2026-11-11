package lat.occlus.patient;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.ConflictException;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Ajuste de los correos de cumpleaños de la clínica. */
@RestController
@RequiredArgsConstructor
public class BirthdayEmailController {

    public record Settings(boolean enabled, boolean mailConfigured, long consentedPatients, long sentThisYear) {}

    public record SettingsRequest(@NotNull Boolean enabled) {}

    private final JdbcTemplate db;
    private final BirthdayEmails emails;

    @GetMapping("/api/outreach/birthday-emails")
    @PreAuthorize("hasAnyRole('ADMIN','RECEPTION')")
    @Transactional(readOnly = true)
    public Settings settings(@AuthenticationPrincipal Jwt jwt) {
        var clinicId = AuthUser.from(jwt).clinicId();
        boolean enabled = Boolean.TRUE.equals(db.queryForObject(
                "select birthday_emails_enabled from clinic where id = ?", Boolean.class, clinicId));
        long consented = db.queryForObject("""
                select count(*) from patient where clinic_id = ? and active and birthday_email_consent and email is not null""",
                Long.class, clinicId);
        long sent = db.queryForObject("select count(*) from birthday_email where clinic_id = ? and year = ?",
                Long.class, clinicId, LocalDate.now(BirthdayEmails.BOGOTA).getYear());
        return new Settings(enabled, emails.mailConfigured(), consented, sent);
    }

    @PutMapping("/api/outreach/birthday-emails")
    @PreAuthorize("hasRole('ADMIN')")
    @Transactional
    public Settings update(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody SettingsRequest req) {
        if (req.enabled() && !emails.mailConfigured()) {
            throw new ConflictException("El envío de correos no está configurado en este servidor.");
        }
        db.update("update clinic set birthday_emails_enabled = ? where id = ?", req.enabled(), AuthUser.from(jwt).clinicId());
        return settings(jwt);
    }
}
