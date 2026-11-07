package lat.occlus.auth;

import static lat.occlus.support.ApiClient.bearer;
import static lat.occlus.support.ApiClient.registerClinic;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.jayway.jsonpath.JsonPath;
import java.time.Instant;
import lat.occlus.TestcontainersConfiguration;
import lat.occlus.shared.tenant.TenantContext;
import lat.occlus.support.PlatformTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

/** Como en producción: el panel exige verificación en dos pasos. */
@SpringBootTest(properties = {
        "occlus.platform.require-two-factor=true",
        "occlus.account-security.totp-key=MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE="})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class PlatformTwoFactorRequiredTests {

    private static final String PASSWORD = "plataforma-secreto-1";

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired PasswordEncoder encoder;

    private String me(String token) throws Exception {
        var res = mvc.perform(get("/api/auth/me").header("Authorization", bearer(token))).andReturn().getResponse();
        assertThat(res.getStatus()).as(res.getContentAsString()).isEqualTo(200);
        return res.getContentAsString();
    }

    private int panel(String token) throws Exception {
        return mvc.perform(get("/api/platform/overview").header("Authorization", bearer(token))).andReturn().getResponse().getStatus();
    }

    @Test
    void adminEntersEnrollsAndOnlyThenUsesThePanel() throws Exception {
        String token = PlatformTestSupport.loginPlatformAdmin(mvc, db, encoder);
        try {
            // Sin verificación puede entrar a la aplicación para activarla; el panel sigue cerrado.
            assertThat((Boolean) JsonPath.read(me(token), "$.platformTwoFactorMissing")).isTrue();
            assertThat(panel(token)).isEqualTo(403);

            var setup = mvc.perform(post("/api/auth/2fa/setup").header("Authorization", bearer(token)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"password\":\"%s\"}".formatted(PASSWORD))).andReturn().getResponse();
            assertThat(setup.getStatus()).isEqualTo(200);
            String secret = JsonPath.read(setup.getContentAsString(), "$.secret");
            String code = Totp.code(base32(secret), Instant.now().getEpochSecond() / 30);
            var enabled = mvc.perform(post("/api/auth/2fa/enable").header("Authorization", bearer(token)).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"code\":\"%s\"}".formatted(code))).andReturn().getResponse();
            assertThat(enabled.getStatus()).isEqualTo(200);

            assertThat((Boolean) JsonPath.read(me(token), "$.platformTwoFactorMissing")).isFalse();
            assertThat(panel(token)).isNotEqualTo(403);
        } finally {
            TenantContext.callAsSystem(() -> {
                db.update("delete from user_recovery_code where user_id = ?::uuid", PlatformTestSupport.PLATFORM_ADMIN_ID);
                return db.update("delete from user_two_factor where user_id = ?::uuid", PlatformTestSupport.PLATFORM_ADMIN_ID);
            });
        }
    }

    @Test
    void clinicUsersAreNotAffected() throws Exception {
        String token = registerClinic(mvc, "Clínica Normal");
        assertThat((Boolean) JsonPath.read(me(token), "$.platformTwoFactorMissing")).isFalse();
    }

    private static byte[] base32(String s) {
        var out = new java.io.ByteArrayOutputStream();
        int buffer = 0, bits = 0;
        for (char c : s.toCharArray()) {
            buffer = (buffer << 5) | "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(c);
            bits += 5;
            if (bits >= 8) {
                out.write((buffer >> (bits - 8)) & 0xff);
                bits -= 8;
            }
        }
        return out.toByteArray();
    }
}
