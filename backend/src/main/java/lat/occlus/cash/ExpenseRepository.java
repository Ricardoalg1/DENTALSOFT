package lat.occlus.cash;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ExpenseRepository extends JpaRepository<Expense, UUID> {

    Optional<Expense> findByIdAndClinicId(UUID id, UUID clinicId);

    /** Efectivo que salió de la caja en un turno (gastos no anulados). */
    @Query("select coalesce(sum(e.amount), 0) from Expense e where e.cashSessionId = :sessionId and e.voidedAt is null")
    BigDecimal sumFromSession(UUID sessionId);
}
