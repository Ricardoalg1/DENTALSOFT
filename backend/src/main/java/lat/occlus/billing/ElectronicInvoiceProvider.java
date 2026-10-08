package lat.occlus.billing;

/** El proveedor real debe devolver pruebas verificables de emisión; nunca se fabrica CUFE/CUV. */
public interface ElectronicInvoiceProvider {
    BillingDtos.ProviderStatus status();
    default BillingDtos.ProviderStatus status(java.util.UUID clinicId) { return status(); }
}
