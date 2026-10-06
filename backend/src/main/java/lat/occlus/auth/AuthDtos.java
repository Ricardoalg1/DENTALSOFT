package lat.occlus.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;
import lat.occlus.user.Role;

public final class AuthDtos {

    private AuthDtos() {}

    /** Alta de una clínica nueva junto con su primer administrador. */
    public record RegisterRequest(
            @NotBlank @Size(max = 150) String clinicName,
            @Size(max = 20) String nit,
            @NotBlank @Size(max = 150) String fullName,
            @NotBlank @Email @Size(max = 160) String email,
            @NotBlank @Size(min = 8, max = 72) String password) {}

    public record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {}

    public record TokenResponse(String accessToken, Instant expiresAt) {}

    public record MeResponse(UUID id, String email, String fullName, Role role, UUID clinicId, String clinicName) {}
}
