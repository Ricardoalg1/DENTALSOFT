package lat.occlus.platform;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.ForbiddenException;
import lat.occlus.user.Role;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Acuerdo de encargo de tratamiento de datos entre Occlus (encargado) y la clínica (responsable).
 * La clínica lo acepta una vez por versión; solo el administrador puede aceptarlo. El texto vive en el
 * frontend (lib/agreement.ts); al cambiarlo se sube {@link #CURRENT_VERSION} y se vuelve a pedir la aceptación.
 */
@RestController
@SkipEntitlements
@RequiredArgsConstructor
public class AgreementController {

    /** Debe coincidir con AGREEMENT_VERSION del frontend. */
    static final String CURRENT_VERSION = "2026-10-v1";

    public record Status(String version, boolean accepted, Instant acceptedAt, String acceptedBy) {}

    public record Accept(@NotBlank @Size(max = 30) String version, @Size(max = 64) String ip, @Size(max = 300) String userAgent) {}

    private final JdbcTemplate db;

    @GetMapping("/api/agreement")
    @Transactional(readOnly = true)
    public Status status() {
        var rows = db.query("""
                select a.accepted_at, u.full_name from clinic_agreement_acceptance a
                join app_user u on u.id = a.user_id where a.version = ?""",
                (rs, i) -> new Status(CURRENT_VERSION, true, rs.getTimestamp("accepted_at").toInstant(), rs.getString("full_name")),
                CURRENT_VERSION);
        return rows.isEmpty() ? new Status(CURRENT_VERSION, false, null, null) : rows.getFirst();
    }

    @PostMapping("/api/agreement/accept")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void accept(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody Accept req) {
        var me = AuthUser.from(jwt);
        if (me.role() != Role.ADMIN) throw new ForbiddenException("Solo el administrador de la clínica puede aceptar el acuerdo.");
        if (!CURRENT_VERSION.equals(req.version())) throw new BadRequestException("La versión del acuerdo cambió. Recarga la página.");
        db.update("""
                insert into clinic_agreement_acceptance (id, clinic_id, user_id, version, ip, user_agent)
                values (?, ?, ?, ?, ?, ?) on conflict (clinic_id, version) do nothing""",
                UUID.randomUUID(), me.clinicId(), me.userId(), CURRENT_VERSION, req.ip(), req.userAgent());
    }
}
