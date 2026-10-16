package lat.occlus.cash;

/** Tipo de ingreso. */
public enum PaymentKind {
    /** Abono a la cuenta del paciente: se descuenta de su estado de cuenta. */
    ACCOUNT,
    /** Recibo de venta con detalle de procedimientos: se cobra y se paga en el mismo acto, no afecta el estado de cuenta. */
    SALE
}
