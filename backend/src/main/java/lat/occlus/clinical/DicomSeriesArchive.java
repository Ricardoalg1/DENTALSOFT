package lat.occlus.clinical;

import java.io.BufferedOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.DigestOutputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.zip.Deflater;
import java.util.zip.ZipEntry;
import java.util.zip.ZipException;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;
import lat.occlus.shared.web.BadRequestException;

/**
 * Serie DICOM subida como ZIP (lo que exportan tomógrafos y equipos de radiografía). No se guarda el ZIP
 * tal cual: se rehace con solo los archivos DICOM, renombrados 0001.dcm, 0002.dcm…, para que nunca queden
 * ejecutables, visores incluidos por el equipo ni rutas raras dentro de la historia clínica.
 *
 * Se lee en flujo y se cuentan los bytes realmente descomprimidos (no lo que dice el ZIP), con topes de
 * cantidad y tamaño para que un ZIP malicioso no llene el disco ni la memoria.
 */
final class DicomSeriesArchive {

    static final long MAX_ZIP_BYTES = 90L * 1024 * 1024;
    static final int MAX_ENTRIES = 5000;
    static final int MAX_IMAGES = 3000;
    static final long MAX_TOTAL_BYTES = 1024L * 1024 * 1024;
    static final long MAX_ENTRY_BYTES = 200L * 1024 * 1024;

    record Result(int images, int skipped, long sizeBytes, String sha256) {}

    private DicomSeriesArchive() {}

    static boolean isZip(byte[] head) {
        return head.length >= 4 && head[0] == 'P' && head[1] == 'K' && head[2] == 3 && head[3] == 4;
    }

    /** Escribe en {@code out} el ZIP depurado. Lanza BadRequestException si el ZIP no sirve. */
    static Result repack(InputStream source, Path out) throws IOException {
        MessageDigest sha = sha256();
        int images = 0;
        int skipped = 0;
        int entries = 0;
        long total = 0;
        try (var zin = new ZipInputStream(source);
             var counting = new CountingOutputStream(new BufferedOutputStream(Files.newOutputStream(out)));
             var zout = new ZipOutputStream(new DigestOutputStream(counting, sha))) {
            zout.setLevel(Deflater.BEST_SPEED);
            byte[] buffer = new byte[64 * 1024];
            ZipEntry entry;
            while ((entry = nextEntry(zin)) != null) {
                if (++entries > MAX_ENTRIES) throw new BadRequestException("El ZIP tiene demasiados archivos (máximo " + MAX_ENTRIES + ")");
                if (entry.isDirectory()) continue;
                // Preámbulo de 128 bytes + «DICM»: así se reconoce un DICOM aunque no tenga extensión.
                byte[] head = zin.readNBytes(132);
                boolean dicom = head.length == 132
                        && new String(Arrays.copyOfRange(head, 128, 132), StandardCharsets.US_ASCII).equals("DICM")
                        && !baseName(entry.getName()).equalsIgnoreCase("DICOMDIR");
                if (!dicom) {
                    skipped++;
                    continue;
                }
                if (++images > MAX_IMAGES) throw new BadRequestException("La serie tiene demasiadas imágenes (máximo " + MAX_IMAGES + ")");
                zout.putNextEntry(new ZipEntry("%04d.dcm".formatted(images)));
                zout.write(head);
                long size = head.length;
                int n;
                while ((n = zin.read(buffer)) > 0) {
                    size += n;
                    if (size > MAX_ENTRY_BYTES) throw new BadRequestException("Una imagen del ZIP es demasiado grande");
                    if (total + size > MAX_TOTAL_BYTES) throw new BadRequestException("El ZIP descomprimido supera 1 GB");
                    zout.write(buffer, 0, n);
                }
                total += size;
                zout.closeEntry();
            }
            if (entries == 0) throw new BadRequestException("El archivo ZIP está vacío o dañado");
            if (images == 0) throw new BadRequestException("El ZIP no trae imágenes DICOM");
            zout.finish();
            zout.flush();
            return new Result(images, skipped, counting.count, HexFormat.of().formatHex(sha.digest()));
        } catch (ZipException e) {
            throw new BadRequestException("El archivo ZIP está dañado o protegido con contraseña");
        }
    }

    private static ZipEntry nextEntry(ZipInputStream zin) throws IOException {
        try {
            return zin.getNextEntry();
        } catch (IllegalArgumentException e) {
            // Nombres con una codificación que Java no entiende.
            throw new BadRequestException("El archivo ZIP está dañado");
        }
    }

    private static String baseName(String name) {
        int slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
        return slash >= 0 ? name.substring(slash + 1) : name;
    }

    private static MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static final class CountingOutputStream extends java.io.FilterOutputStream {
        long count;

        CountingOutputStream(OutputStream out) {
            super(out);
        }

        @Override
        public void write(int b) throws IOException {
            out.write(b);
            count++;
        }

        @Override
        public void write(byte[] b, int off, int len) throws IOException {
            out.write(b, off, len);
            count += len;
        }
    }
}
