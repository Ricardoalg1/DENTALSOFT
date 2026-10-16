package lat.occlus.cash;

/** Forma de pago de un ingreso. */
public enum PaymentTerm {
    /** De contado: se paga completo en el acto. */
    CASH,
    /** A crédito: el saldo se financia en cuotas (Financiamiento). */
    CREDIT
}
