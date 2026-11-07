package lat.occlus.auth;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Cifra los secretos TOTP con AES-256-GCM. La llave vive fuera de la base de datos: una copia robada de
 * la base no permite generar códigos. El id del usuario entra como dato autenticado, así que un secreto
 * copiado a la fila de otra persona no descifra.
 */
@Component
class TotpCipher {

    private static final String VERSION = "v1:";
    private static final int IV_BYTES = 12;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final SecretKeySpec key;

    TotpCipher(@Value("${occlus.account-security.totp-key:}") String base64Key) {
        if (base64Key == null || base64Key.isBlank()) {
            key = null;
            return;
        }
        byte[] raw;
        try {
            raw = Base64.getDecoder().decode(base64Key.trim());
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("TOTP_ENCRYPTION_KEY debe estar en Base64");
        }
        if (raw.length != 32) throw new IllegalStateException("TOTP_ENCRYPTION_KEY debe tener 32 bytes (openssl rand -base64 32)");
        key = new SecretKeySpec(raw, "AES");
    }

    boolean available() {
        return key != null;
    }

    String encrypt(UUID userId, byte[] secret) {
        byte[] iv = new byte[IV_BYTES];
        RANDOM.nextBytes(iv);
        try {
            byte[] sealed = cipher(Cipher.ENCRYPT_MODE, iv, userId).doFinal(secret);
            return VERSION + Base64.getEncoder().encodeToString(ByteBuffer.allocate(IV_BYTES + sealed.length).put(iv).put(sealed).array());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("No se pudo cifrar el secreto", e);
        }
    }

    byte[] decrypt(UUID userId, String stored) {
        if (!stored.startsWith(VERSION)) throw new IllegalStateException("Versión de cifrado desconocida");
        byte[] all = Base64.getDecoder().decode(stored.substring(VERSION.length()));
        byte[] iv = java.util.Arrays.copyOf(all, IV_BYTES);
        try {
            return cipher(Cipher.DECRYPT_MODE, iv, userId).doFinal(all, IV_BYTES, all.length - IV_BYTES);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("No se pudo descifrar el secreto", e);
        }
    }

    private Cipher cipher(int mode, byte[] iv, UUID userId) throws GeneralSecurityException {
        if (key == null) throw new IllegalStateException("Falta TOTP_ENCRYPTION_KEY");
        var cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(mode, key, new GCMParameterSpec(128, iv));
        cipher.updateAAD(userId.toString().getBytes(StandardCharsets.UTF_8));
        return cipher;
    }
}
