package lat.occlus.support;

import static lat.occlus.support.ApiClient.bearer;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.UUID;
import lat.occlus.shared.tenant.TenantContext;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

/** Ayudantes para probar el panel de plataforma con la API real. */
public final class PlatformTestSupport {

    /** UUID fijo: se registra en occlus.marketing.admin-user-ids de la configuración de pruebas. */
    public static final String PLATFORM_ADMIN_ID = "00000000-0000-4000-8000-0000000000a1";
    private static final String PLATFORM_CLINIC_ID = "00000000-0000-4000-8000-0000000000c1";
    public static final String PLATFORM_ADMIN_EMAIL = "plataforma@occlus.test";
    private static final String PLATFORM_PASSWORD = "plataforma-secreto-1";

    private PlatformTestSupport() {}

    /** Crea (una sola vez) la clínica interna de Occlus y su administrador de plataforma, y devuelve su token. */
    public static String loginPlatformAdmin(MockMvc mvc, JdbcTemplate jdbc, PasswordEncoder encoder) throws Exception {
        TenantContext.callAsSystem(() -> {
            jdbc.update("insert into clinic (id, name) values (?::uuid, 'Occlus (plataforma)') on conflict do nothing", PLATFORM_CLINIC_ID);
            jdbc.update("""
                    insert into app_user (id, clinic_id, email, password_hash, full_name, role, active, professional)
                    values (?::uuid, ?::uuid, ?, ?, 'Equipo Occlus', 'ADMIN', true, false) on conflict do nothing""",
                    PLATFORM_ADMIN_ID, PLATFORM_CLINIC_ID, PLATFORM_ADMIN_EMAIL, encoder.encode(PLATFORM_PASSWORD));
            jdbc.update("""
                    insert into clinic_subscription (clinic_id, plan_code, status, billing_cycle, price, modules)
                    select ?::uuid, 'INTERNAL', 'ACTIVE', 'MONTHLY', 0, modules from subscription_plan where code = 'INTERNAL'
                    on conflict do nothing""", PLATFORM_CLINIC_ID);
            jdbc.update("insert into platform_client (clinic_id, source) values (?::uuid, 'MANUAL') on conflict do nothing", PLATFORM_CLINIC_ID);
            return null;
        });
        return login(mvc, PLATFORM_ADMIN_EMAIL, PLATFORM_PASSWORD);
    }

    public static String login(MockMvc mvc, String email, String password) throws Exception {
        String json = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(json, "$.accessToken");
    }

    /** Cliente creado por el panel, con su administrador ya habiendo cambiado la contraseña temporal. */
    public record Client(UUID clinicId, String adminEmail, String token) {}

    /** Parámetros mínimos; el resto queda por defecto. {@code modules} null = los del plan. */
    public static Client createClient(MockMvc mvc, String platformToken, String plan, int trialDays, Integer maxUsers,
                                      String modulesJson) throws Exception {
        String email = ApiClient.uniqueEmail("cliente");
        String body = """
                {"clinicName":"Clínica %s","adminName":"Admin Cliente","adminEmail":"%s","planCode":"%s",
                 "billingCycle":"MONTHLY","trialDays":%d,%s%s"paymentReference":"%s"}"""
                .formatted(UUID.randomUUID().toString().substring(0, 6), email, plan, trialDays,
                        maxUsers == null ? "" : "\"maxUsers\":" + maxUsers + ",",
                        modulesJson == null ? "" : "\"modules\":" + modulesJson + ",",
                        trialDays == 0 ? "TRF-0001" : "");
        String json = mvc.perform(post("/api/platform/clinics").header("Authorization", bearer(platformToken))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID clinicId = UUID.fromString(JsonPath.read(json, "$.clinicId"));
        String temp = JsonPath.read(json, "$.temporaryPassword");
        String token = changePassword(mvc, login(mvc, email, temp), temp, "Clave-definitiva-9");
        return new Client(clinicId, email, token);
    }

    public static String changePassword(MockMvc mvc, String token, String current, String next) throws Exception {
        String json = mvc.perform(post("/api/auth/change-password").header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"%s\",\"newPassword\":\"%s\"}".formatted(current, next)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(json, "$.accessToken");
    }

    public static String json(MockMvc mvc, String path, String token) throws Exception {
        return mvc.perform(get(path).header("Authorization", bearer(token))).andReturn().getResponse().getContentAsString();
    }
}
