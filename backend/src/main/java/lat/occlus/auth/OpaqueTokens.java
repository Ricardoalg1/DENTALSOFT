package lat.occlus.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

/**
 * Valores secretos de alta entropía (enlaces de recuperación, retos de ingreso, códigos de respaldo). En la
 * base solo queda su SHA-256: quien lea la base no puede usarlos. Basta un hash rápido porque, a diferencia
 * de una contraseña, el valor es aleatorio y no se puede adivinar.
 */
public final class OpaqueTokens {

    /** Sin I, O, 0 ni 1: se transcriben a mano sin confundirse. */
    private static final char[] CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
    private static final SecureRandom RANDOM = new SecureRandom();

    private OpaqueTokens() {}

    public static String newToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /** 16 caracteres (80 bits) en grupos de cuatro: ABCD-EFGH-JKLM-NPQR. */
    static String newRecoveryCode() {
        var code = new StringBuilder(19);
        for (int i = 0; i < 16; i++) {
            if (i > 0 && i % 4 == 0) code.append('-');
            code.append(CODE_ALPHABET[RANDOM.nextInt(CODE_ALPHABET.length)]);
        }
        return code.toString();
    }

    static String normalizeRecoveryCode(String code) {
        return code.replaceAll("[\\s-]", "").toUpperCase(java.util.Locale.ROOT);
    }

    public static String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
