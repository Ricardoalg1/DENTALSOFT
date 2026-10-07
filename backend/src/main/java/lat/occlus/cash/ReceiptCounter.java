package lat.occlus.cash;

import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Consecutivo por clínica. El UPSERT bloquea la fila del contador hasta que termina la transacción,
 * así dos pagos simultáneos nunca reciben el mismo número.
 */
@Component
@RequiredArgsConstructor
class ReceiptCounter {

    static final String RECEIPT = "RECEIPT";

    private final JdbcTemplate jdbc;

    @Transactional(propagation = Propagation.MANDATORY)
    long next(UUID clinicId, String name) {
        Long value = jdbc.queryForObject("""
                insert into clinic_counter (clinic_id, name, value) values (?, ?, 1)
                on conflict (clinic_id, name) do update set value = clinic_counter.value + 1
                returning value""", Long.class, clinicId, name);
        return value == null ? 1 : value;
    }
}
