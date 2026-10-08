package lat.occlus.billing;


public class UnconfiguredInvoiceProvider implements ElectronicInvoiceProvider {
    @Override
    public BillingDtos.ProviderStatus status() {
        return new BillingDtos.ProviderStatus(false,"Sin proveedor",
                "Selecciona un proveedor tecnológico y configura su entorno de pruebas para habilitar la emisión DIAN.");
    }
}
