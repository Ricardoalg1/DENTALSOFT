package lat.occlus.treatment;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface TreatmentItemRepository extends JpaRepository<TreatmentItem, UUID> {

    List<TreatmentItem> findByPlanIdInOrderBySortOrderAscCreatedAtAsc(Collection<UUID> planIds);

    List<TreatmentItem> findByPlanIdOrderBySortOrderAscCreatedAtAsc(UUID planId);

    Optional<TreatmentItem> findByIdAndPlanId(UUID id, UUID planId);

    /** Suma (cantidad × precio − descuento) de los ítems del paciente que cumplen los filtros. */
    @Query("""
            select coalesce(sum(i.unitPrice * i.quantity - i.discount), 0)
            from TreatmentItem i join TreatmentPlan p on p.id = i.planId
            where p.clinicId = :clinicId and p.patientId = :patientId
              and p.status in :planStatuses and i.status in :itemStatuses""")
    BigDecimal sumForPatient(UUID clinicId, UUID patientId,
                             Collection<PlanStatus> planStatuses, Collection<ItemStatus> itemStatuses);

    /** Ítems pendientes de planes vivos, para no volver a sugerir lo que ya está presupuestado. */
    @Query("""
            select i from TreatmentItem i join TreatmentPlan p on p.id = i.planId
            where p.clinicId = :clinicId and p.patientId = :patientId
              and p.status in (lat.occlus.treatment.PlanStatus.DRAFT, lat.occlus.treatment.PlanStatus.ACCEPTED)
              and i.status = lat.occlus.treatment.ItemStatus.PENDING""")
    List<TreatmentItem> findOpenForPatient(UUID clinicId, UUID patientId);
}
