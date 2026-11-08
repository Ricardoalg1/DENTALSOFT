package lat.occlus.dictation;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import lat.occlus.shared.web.BadRequestException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * Dictado remoto: lo usa el navegador cuando el equipo no transcribe a buena velocidad. Cada clínica tiene un tope
 * mensual de minutos para que el gasto no se dispare. Sin transacción: la llamada a Groq no debe retener una conexión.
 */
@Service
@RequiredArgsConstructor
class DictationService {

    public record Status(boolean remote, int usedMinutes, int monthlyMinutes) {}

    private static final int SAMPLE_RATE = 16000;
    private static final int HEADER = 44;
    private static final int MAX_SECONDS = 30;
    /** Groq cobra al menos 10 s por petición: se cuenta igual para que el tope refleje el costo real. */
    private static final int MIN_BILLED_SECONDS = 10;
    private static final String MONTH = "date_trunc('month', now() at time zone 'America/Bogota')::date";

    private final DictationProperties props;
    private final GroqTranscriber groq;
    private final JdbcTemplate db;

    Status status(UUID clinicId) {
        int used = usedSeconds(clinicId);
        int limit = props.monthlyMinutesPerClinic() * 60;
        return new Status(props.remoteConfigured() && used < limit, used / 60, props.monthlyMinutesPerClinic());
    }

    String transcribe(UUID clinicId, byte[] wav) {
        if (!props.remoteConfigured()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "El dictado en línea no está activado.");
        }
        int seconds = seconds(wav);
        if (usedSeconds(clinicId) >= props.monthlyMinutesPerClinic() * 60) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "La clínica usó los minutos de dictado en línea de este mes. El dictado sigue funcionando en este equipo.");
        }
        String text = groq.transcribe(wav);
        db.update("""
                insert into dictation_usage (clinic_id, month, seconds) values (?, %s, ?)
                on conflict (clinic_id, month) do update set seconds = dictation_usage.seconds + excluded.seconds""".formatted(MONTH),
                clinicId, Math.max(MIN_BILLED_SECONDS, seconds));
        return text;
    }

    private int usedSeconds(UUID clinicId) {
        var rows = db.queryForList("select seconds from dictation_usage where clinic_id = ? and month = " + MONTH,
                Integer.class, clinicId);
        return rows.isEmpty() ? 0 : rows.getFirst();
    }

    /** Solo acepta el WAV que arma el navegador de Occlus: PCM de 16 bits, mono, 16 kHz y hasta 30 s. Devuelve su duración. */
    static int seconds(byte[] wav) {
        if (wav == null || wav.length <= HEADER || wav.length > HEADER + MAX_SECONDS * SAMPLE_RATE * 2) {
            throw new BadRequestException("Audio no válido");
        }
        var b = ByteBuffer.wrap(wav).order(ByteOrder.LITTLE_ENDIAN);
        boolean valid = ascii(wav, 0, "RIFF") && ascii(wav, 8, "WAVE") && ascii(wav, 12, "fmt ") && ascii(wav, 36, "data")
                && b.getShort(20) == 1 && b.getShort(22) == 1 && b.getInt(24) == SAMPLE_RATE && b.getShort(34) == 16
                && b.getInt(40) == wav.length - HEADER;
        if (!valid) throw new BadRequestException("Audio no válido");
        return (int) Math.ceil((wav.length - HEADER) / (SAMPLE_RATE * 2.0));
    }

    private static boolean ascii(byte[] wav, int at, String expected) {
        return new String(wav, at, 4, StandardCharsets.US_ASCII).equals(expected);
    }
}
