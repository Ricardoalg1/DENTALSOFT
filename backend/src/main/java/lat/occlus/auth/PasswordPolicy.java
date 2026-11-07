package lat.occlus.auth;

import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;
import lat.occlus.shared.web.BadRequestException;

/** Reglas para una contraseña nueva: largo antes que símbolos, y nada de lo primero que se probaría. */
final class PasswordPolicy {

    static final int MIN_LENGTH = 10;
    /** bcrypt solo considera 72 bytes; más que eso se rechaza en vez de truncarse sin avisar. */
    private static final int MAX_BYTES = 72;
    private static final Set<String> COMMON = Set.of(
            "1234567890", "0123456789", "0987654321", "12345678910", "123456789a", "a123456789", "1q2w3e4r5t",
            "qwertyuiop", "qwerty1234", "password12", "password123", "contrasena", "contraseña", "contrasena1",
            "contraseña1", "contrasena123", "contraseña123", "administrador", "admin12345", "admin123456",
            "bienvenido1", "bienvenido123", "colombia123", "colombia2026", "odontologia", "odontologia1",
            "odontologia123", "clinica123", "clinica1234", "dentista123", "occlus1234", "occlus12345", "occlus123456");

    private PasswordPolicy() {}

    static void check(String password, String email) {
        if (password.length() < MIN_LENGTH) throw new BadRequestException("Usa al menos " + MIN_LENGTH + " caracteres.");
        if (password.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) throw new BadRequestException("La contraseña es demasiado larga.");
        String lower = password.toLowerCase(Locale.ROOT);
        if (COMMON.contains(lower) || lower.chars().distinct().count() < 4) {
            throw new BadRequestException("Esa contraseña es muy fácil de adivinar. Elige otra.");
        }
        String local = email == null ? "" : email.split("@")[0].toLowerCase(Locale.ROOT);
        if (local.length() >= 4 && lower.contains(local)) {
            throw new BadRequestException("La contraseña no debe contener tu correo.");
        }
    }
}
