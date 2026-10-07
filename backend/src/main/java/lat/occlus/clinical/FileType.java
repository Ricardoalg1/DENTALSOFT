package lat.occlus.clinical;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Optional;

/**
 * Formatos aceptados, detectados por los primeros bytes del archivo (no por la extensión ni por lo
 * que diga el navegador, que se pueden falsificar).
 */
enum FileType {
    JPEG("image/jpeg", "jpg"),
    PNG("image/png", "png"),
    WEBP("image/webp", "webp"),
    PDF("application/pdf", "pdf");

    final String contentType;
    final String extension;

    FileType(String contentType, String extension) {
        this.contentType = contentType;
        this.extension = extension;
    }

    static Optional<FileType> detect(byte[] b) {
        if (startsWith(b, 0xFF, 0xD8, 0xFF)) return Optional.of(JPEG);
        if (startsWith(b, 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A)) return Optional.of(PNG);
        if (b.length >= 12 && ascii(b, 0, 4).equals("RIFF") && ascii(b, 8, 12).equals("WEBP")) return Optional.of(WEBP);
        if (ascii(b, 0, Math.min(b.length, 5)).equals("%PDF-")) return Optional.of(PDF);
        return Optional.empty();
    }

    private static boolean startsWith(byte[] b, int... prefix) {
        if (b.length < prefix.length) return false;
        for (int i = 0; i < prefix.length; i++) {
            if ((b[i] & 0xFF) != prefix[i]) return false;
        }
        return true;
    }

    private static String ascii(byte[] b, int from, int to) {
        return to <= b.length ? new String(Arrays.copyOfRange(b, from, to), StandardCharsets.US_ASCII) : "";
    }
}
