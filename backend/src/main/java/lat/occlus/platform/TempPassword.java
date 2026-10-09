package lat.occlus.platform;

import java.security.SecureRandom;

/** Contraseñas temporales legibles: sin caracteres ambiguos (0/O, 1/l/I) y con guiones para dictarlas. */
final class TempPassword {

    private static final String ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    private static final SecureRandom RANDOM = new SecureRandom();

    private TempPassword() {}

    /** 12 caracteres (≈ 69 bits) en grupos de cuatro: "Xk7Q-mN3p-Rt9H". */
    static String generate() {
        var sb = new StringBuilder();
        for (int i = 0; i < 12; i++) {
            if (i > 0 && i % 4 == 0) sb.append('-');
            sb.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        }
        return sb.toString();
    }
}
