package lat.occlus.auth;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.OptionalLong;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Códigos de un solo uso por tiempo (RFC 6238): 6 dígitos cada 30 s, compatibles con cualquier app autenticadora. */
final class Totp {

    private static final int PERIOD_SECONDS = 30;
    /** Un paso antes y uno después: tolera relojes de teléfono algo desfasados. */
    private static final int WINDOW = 1;
    private static final char[] BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".toCharArray();
    private static final SecureRandom RANDOM = new SecureRandom();

    private Totp() {}

    /** 160 bits, el tamaño que recomienda el RFC 4226 para HMAC-SHA1. */
    static byte[] newSecret() {
        byte[] secret = new byte[20];
        RANDOM.nextBytes(secret);
        return secret;
    }

    static String code(byte[] secret, long step) {
        try {
            var mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(secret, "HmacSHA1"));
            byte[] hash = mac.doFinal(java.nio.ByteBuffer.allocate(8).putLong(step).array());
            int offset = hash[hash.length - 1] & 0xf;
            int binary = java.nio.ByteBuffer.wrap(hash, offset, 4).getInt() & 0x7fffffff;
            return String.format("%06d", binary % 1_000_000);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Paso de tiempo que corresponde al código. Revisa toda la ventana y compara en tiempo constante. */
    static OptionalLong matchStep(byte[] secret, String code, long epochSeconds) {
        long current = epochSeconds / PERIOD_SECONDS;
        byte[] given = code.getBytes(StandardCharsets.UTF_8);
        OptionalLong match = OptionalLong.empty();
        for (long step = current - WINDOW; step <= current + WINDOW; step++) {
            if (MessageDigest.isEqual(code(secret, step).getBytes(StandardCharsets.UTF_8), given)) match = OptionalLong.of(step);
        }
        return match;
    }

    static String base32(byte[] data) {
        var out = new StringBuilder();
        int buffer = 0, bits = 0;
        for (byte b : data) {
            buffer = (buffer << 8) | (b & 0xff);
            bits += 8;
            while (bits >= 5) {
                out.append(BASE32[(buffer >> (bits - 5)) & 31]);
                bits -= 5;
            }
        }
        if (bits > 0) out.append(BASE32[(buffer << (5 - bits)) & 31]);
        return out.toString();
    }

    static String otpauthUri(byte[] secret, String email) {
        String label = URLEncoder.encode("Occlus:" + email, StandardCharsets.UTF_8).replace("+", "%20");
        return "otpauth://totp/" + label + "?secret=" + base32(secret) + "&issuer=Occlus&algorithm=SHA1&digits=6&period=" + PERIOD_SECONDS;
    }
}
