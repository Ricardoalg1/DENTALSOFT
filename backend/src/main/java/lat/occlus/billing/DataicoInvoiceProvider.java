package lat.occlus.billing;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.ForbiddenException;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component
@EnableConfigurationProperties(DataicoProperties.class)
public class DataicoInvoiceProvider implements ElectronicInvoiceProvider {
    private static final String INVOICES = "https://api.dataico.com/direct/dataico_api/v2/invoices";
    private final DataicoProperties config;
    private final ObjectMapper mapper;
    // No redirigir una petición autenticada a otro servidor. No reintentar emisiones.
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NEVER).build();

    public DataicoInvoiceProvider(DataicoProperties config, ObjectMapper mapper) {
        this.config = config;
        this.mapper = mapper;
    }

    @Override public BillingDtos.ProviderStatus status() {
        return new BillingDtos.ProviderStatus(false, "Dataico",
                "Configura la cuenta Dataico y vincúlala a la clínica. La emisión DIAN sigue pendiente.");
    }

    @Override public BillingDtos.ProviderStatus status(UUID clinicId) {
        if (!config.configured() || !config.clinicId().equals(clinicId)) return status();
        return new BillingDtos.ProviderStatus(true, "Dataico",
                "Credenciales configuradas (sin verificar). Consulta de facturas disponible; emisión DIAN pendiente de configurar numeración y tipo de operación.");
    }

    /** Consulta por número autorizado por Dataico. No entrega su respuesta cruda a otros tenants. */
    public InvoiceLookup lookup(UUID clinicId, String number) {
        if (!config.configured()) throw new BadRequestException("Configura las credenciales Dataico en el backend.");
        if (!config.clinicId().equals(clinicId)) throw new ForbiddenException("La cuenta Dataico no pertenece a esta clínica.");
        if (number == null || !number.matches("[A-Za-z0-9-]{1,40}"))
            throw new BadRequestException("Indica el número completo de factura, por ejemplo FE18.");
        var request = HttpRequest.newBuilder(URI.create(INVOICES + "?number=" + URLEncoder.encode(number, StandardCharsets.UTF_8)))
                .timeout(Duration.ofSeconds(30)).header("Auth-token", config.authToken())
                .header("Accept", "application/json").GET().build();
        try {
            var response = client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() == 401 || response.statusCode() == 403)
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Dataico rechazó la autenticación. Revisa la llave y los permisos de la cuenta.");
            if (response.statusCode() == 404)
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Dataico no encontró esa factura.");
            if (response.statusCode() < 200 || response.statusCode() >= 300)
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Dataico no pudo completar la consulta (HTTP " + response.statusCode() + ").");
            var root = mapper.readTree(response.body());
            var invoice = root.has("invoice") ? root.get("invoice") : root;
            if (invoice == null || !invoice.isObject() || text(invoice, "uuid") == null)
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"Dataico no devolvió una factura identificable.");
            // Solo devolver evidencia explícita. No inventar CUFE ni interpretar éxito HTTP como aceptación DIAN.
            return new InvoiceLookup(text(invoice,"number") == null ? number : text(invoice,"number"), text(invoice,"uuid"), text(invoice,"cufe"), text(invoice,"dian_status"));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.GATEWAY_TIMEOUT,"Consulta Dataico interrumpida.");
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"No fue posible conectar con Dataico.");
        } catch (tools.jackson.core.JacksonException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"La respuesta Dataico no tiene el formato JSON esperado.");
        }
    }
    private static String text(JsonNode node, String key) {
        var value=node.get(key);
        return value==null || !value.isString() ? null : value.asString();
    }
    public record InvoiceLookup(String number, String uuid, String cufe, String dianStatus) {}
}
