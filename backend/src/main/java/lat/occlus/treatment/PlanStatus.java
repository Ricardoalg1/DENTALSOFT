package lat.occlus.treatment;

public enum PlanStatus {
    /** Presupuesto en elaboración: se edita libremente. */
    DRAFT,
    /** El paciente lo aprobó: los precios quedan fijos y se van realizando los ítems. */
    ACCEPTED,
    /** Todos los ítems realizados (o cancelados). */
    COMPLETED,
    /** El paciente no lo aceptó. */
    REJECTED,
    /** Se suspendió después de aceptado; lo pendiente queda cancelado. */
    CANCELLED
}
