package lat.occlus.user;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public final class UserDtos {

    private UserDtos() {}

    public record CreateUserRequest(
            @NotBlank @Email @Size(max = 160) String email,
            @NotBlank @Size(max = 150) String fullName,
            @NotNull Role role,
            @NotBlank @Size(min = 8, max = 72) String password) {}

    /** Campos opcionales: solo se actualiza lo que venga distinto de null. */
    public record UpdateUserRequest(@Size(max = 150) String fullName, Role role, Boolean active) {}

    public record UserResponse(UUID id, String email, String fullName, Role role, boolean active) {
        public static UserResponse from(AppUser u) {
            return new UserResponse(u.getId(), u.getEmail(), u.getFullName(), u.getRole(), u.isActive());
        }
    }
}
