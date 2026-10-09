package lat.occlus.platform;

import java.util.Map;
import java.util.UUID;
import lat.occlus.platform.PlatformDtos.CreateClientRequest;
import lat.occlus.platform.PlatformDtos.CreatedClient;
import lat.occlus.shared.security.AuthUser;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Alta de clientes desde el panel. Va fuera de una transacción porque el aprovisionamiento abre la suya. */
@Service
@RequiredArgsConstructor
public class PlatformService {

    private final ProvisioningService provisioning;
    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    private final PlatformAudit audit;

    /** Llamar dentro de {@link PlatformGate#call}: ya autorizado y en modo sistema. */
    public CreatedClient createClient(AuthUser me, CreateClientRequest r) {
        String password = TempPassword.generate();
        var result = provisioning.provision(new ProvisioningService.Request(
                r.clinicName(), r.nit(), r.adminName(), r.adminEmail(), password, true, r.planCode(), r.billingCycle(),
                r.price(), r.maxUsers(), r.modules(), r.trialDays(), r.paymentReference(),
                new ProvisioningService.ClientData(r.legalName(), r.contactName(), r.contactEmail(), r.contactPhone(), r.city(), r.notes()),
                r.leadId() == null ? "MANUAL" : "LEAD"), me);
        if (r.leadId() != null) markLeadWon(me, r.leadId(), result.clinicId(), r.clinicName().trim());
        return new CreatedClient(result.clinicId(), r.adminEmail().trim().toLowerCase(), password);
    }

    /** La solicitud del CRM de la que viene el cliente queda ganada, con una nota que lo explica. */
    private void markLeadWon(AuthUser me, UUID leadId, UUID clinicId, String clinicName) {
        tx.executeWithoutResult(status -> {
            if (db.update("update demo_lead set status = 'WON', updated_at = now() where id = ?", leadId) == 0) return;
            db.update("insert into lead_activity (id, lead_id, status, note, created_by) values (?, ?, 'WON', ?, ?)",
                    UUID.randomUUID(), leadId, "Convertida en cliente: " + clinicName, me.userId());
            audit.record(me, "LEAD_CONVERTED", clinicId, "Convirtió una solicitud del CRM en cliente", Map.of("leadId", leadId.toString()));
        });
    }
}
