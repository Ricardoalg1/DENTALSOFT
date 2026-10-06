package lat.occlus.shared.tenant;

import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Clínica activa del hilo actual. {@link TenantAwareDataSource} la pasa a Postgres en cada
 * conexión y las políticas de Row-Level Security filtran con ella.
 *
 * <p>El contexto se fija ANTES de abrir la transacción: la conexión se configura al obtenerla
 * del pool, así que cambiarlo dentro de una transacción ya abierta no tendría efecto.
 */
public final class TenantContext {

    private record State(UUID clinicId, boolean system) {}

    private static final ThreadLocal<State> CURRENT = new ThreadLocal<>();

    private TenantContext() {}

    public static Optional<UUID> clinicId() {
        State s = CURRENT.get();
        return s == null ? Optional.empty() : Optional.ofNullable(s.clinicId());
    }

    public static boolean isSystem() {
        State s = CURRENT.get();
        return s != null && s.system();
    }

    /** Ejecuta {@code action} como la clínica indicada. */
    public static <T> T callAs(UUID clinicId, Supplier<T> action) {
        return with(new State(clinicId, false), action);
    }

    /**
     * Ejecuta {@code action} sin filtro de clínica. Solo para operaciones que por naturaleza
     * cruzan clínicas (login por correo, unicidad global del correo). Úsalo con cuidado.
     */
    public static <T> T callAsSystem(Supplier<T> action) {
        return with(new State(null, true), action);
    }

    static void set(UUID clinicId) {
        CURRENT.set(new State(clinicId, false));
    }

    static void clear() {
        CURRENT.remove();
    }

    private static <T> T with(State state, Supplier<T> action) {
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("El contexto de clínica debe fijarse fuera de una transacción");
        }
        State previous = CURRENT.get();
        CURRENT.set(state);
        try {
            return action.get();
        } finally {
            if (previous == null) CURRENT.remove();
            else CURRENT.set(previous);
        }
    }
}
