package lat.occlus.auth;

import static lat.occlus.support.ApiClient.bearer;
import static lat.occlus.support.ApiClient.registerClinic;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.jayway.jsonpath.JsonPath;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import lat.occlus.TestcontainersConfiguration;
import lat.occlus.shared.tenant.TenantContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Recuperar contraseña y verificación en dos pasos, de punta a punta contra Postgres real con RLS. */
@SpringBootTest(properties = {
        "occlus.account-security.totp-key=MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=",
        "occlus.account-security.app-url=https://app.ejemplo.test"})
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, AccountSecurityTests.MailConfig.class})
class AccountSecurityTests {

    record Sent(String to, String subject, String text) {}

    @TestConfiguration(proxyBeanMethods = false)
    static class MailConfig {
        @Bean
        @Primary
        RecordingTransport recordingTransport() {
            return new RecordingTransport();
        }
    }

    static class RecordingTransport implements MailTransport {
        final List<Sent> sent = new CopyOnWriteArrayList<>();

        @Override
        public boolean configured() {
            return true;
        }

        @Override
        public void send(String to, String subject, String text) {
            sent.add(new Sent(to, subject, text));
        }
    }

    private static final String PASSWORD = "secreto123";

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired RecordingTransport mail;
    // Cada prueba usa su propia cuenta como si fuera de plataforma, para no compartir estado de verificación.
    @MockitoSpyBean lat.occlus.platform.PlatformGate gate;

    @BeforeEach
    void clearMail() {
        mail.sent.clear();
        org.mockito.Mockito.doReturn(true).when(gate).isListed(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }

    // ---------- Apoyo ----------

    private record Account(String token, String email, UUID id) {}

    private Account account(String clinic) throws Exception {
        String token = registerClinic(mvc, clinic);
        String me = mvc.perform(get("/api/auth/me").header("Authorization", bearer(token))).andReturn().getResponse().getContentAsString();
        return new Account(token, JsonPath.read(me, "$.email"), UUID.fromString(JsonPath.read(me, "$.id")));
    }

    private int status(MockHttpServletRequestBuilder req) throws Exception {
        return mvc.perform(req).andReturn().getResponse().getStatus();
    }

    private MockHttpServletRequestBuilder postJson(String path, String json) {
        return post(path).contentType(MediaType.APPLICATION_JSON).content(json);
    }

    private String loginRaw(String email, String password) throws Exception {
        var res = mvc.perform(postJson("/api/auth/login", "{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password))).andReturn().getResponse();
        assertThat(res.getStatus()).isEqualTo(200);
        return res.getContentAsString();
    }

    private static byte[] base32Decode(String s) {
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

    /** Código válido de ahora, olvidando el último usado (en las pruebas no se puede esperar 30 s entre códigos). */
    private String code(Account a, byte[] secret) {
        TenantContext.callAsSystem(() -> db.update("update user_two_factor set last_step = 0, locked_until = null, failed_attempts = 0 where user_id = ?", a.id()));
        return Totp.code(secret, Instant.now().getEpochSecond() / 30);
    }

    private record Enrolled(byte[] secret, List<String> recoveryCodes) {}

    private Enrolled enroll(Account a) throws Exception {
        var setup = mvc.perform(postJson("/api/auth/2fa/setup", "{\"password\":\"%s\"}".formatted(PASSWORD)).header("Authorization", bearer(a.token())))
                .andReturn().getResponse();
        assertThat(setup.getStatus()).isEqualTo(200);
        byte[] secret = base32Decode(JsonPath.read(setup.getContentAsString(), "$.secret"));
        assertThat((String) JsonPath.read(setup.getContentAsString(), "$.otpauthUri")).startsWith("otpauth://totp/Occlus%3A").contains("issuer=Occlus");
        var enabled = mvc.perform(postJson("/api/auth/2fa/enable", "{\"code\":\"%s\"}".formatted(Totp.code(secret, Instant.now().getEpochSecond() / 30)))
                .header("Authorization", bearer(a.token()))).andReturn().getResponse();
        assertThat(enabled.getStatus()).isEqualTo(200);
        return new Enrolled(secret, new ArrayList<>(JsonPath.<List<String>>read(enabled.getContentAsString(), "$.codes")));
    }

    private String awaitResetToken(String email) throws Exception {
        for (int i = 0; i < 100; i++) {
            var found = mail.sent.stream().filter(m -> m.to().equals(email) && m.subject().contains("Restablece")).findFirst();
            if (found.isPresent()) {
                assertThat(found.get().text()).contains("https://app.ejemplo.test/restablecer#t=");
                return found.get().text().split("#t=")[1].split("\\s")[0];
            }
            Thread.sleep(50);
        }
        throw new AssertionError("No llegó el correo de recuperación");
    }

    private void awaitWorkerIdle() throws Exception {
        Thread.sleep(500);
    }

    private int confirmReset(String token, String password, String code) throws Exception {
        String codeJson = code == null ? "" : ",\"code\":\"%s\"".formatted(code);
        return status(postJson("/api/auth/password-reset/confirm", "{\"token\":\"%s\",\"newPassword\":\"%s\"%s}".formatted(token, password, codeJson)));
    }

    // ---------- Piezas ----------

    @Test
    void totpMatchesRfc6238Vectors() {
        byte[] secret = "12345678901234567890".getBytes(java.nio.charset.StandardCharsets.US_ASCII);
        // Vectores del RFC 6238 (SHA-1), últimos 6 de los 8 dígitos publicados.
        assertThat(Totp.code(secret, 59 / 30)).isEqualTo("287082");
        assertThat(Totp.code(secret, 1111111109L / 30)).isEqualTo("081804");
        assertThat(Totp.code(secret, 1234567890L / 30)).isEqualTo("005924");
        assertThat(Totp.code(secret, 20000000000L / 30)).isEqualTo("353130");
        assertThat(Totp.base32("foobar".getBytes())).isEqualTo("MZXW6YTBOI"); // RFC 4648, sin relleno
        assertThat(Totp.matchStep(secret, "287082", 59 + 30)).isPresent(); // un paso de tolerancia
        assertThat(Totp.matchStep(secret, "287082", 59 + 60)).isEmpty();
    }

    @Test
    void secretCopiedToAnotherUserCannotBeDecrypted() {
        var cipher = new TotpCipher("MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=");
        UUID owner = UUID.randomUUID();
        byte[] secret = Totp.newSecret();
        String stored = cipher.encrypt(owner, secret);
        assertThat(stored).startsWith("v1:");
        assertThat(cipher.decrypt(owner, stored)).isEqualTo(secret);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> cipher.decrypt(UUID.randomUUID(), stored)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void lockGrowsAndIsCapped() {
        assertThat(TwoFactorService.lockFor(1)).hasMinutes(15);
        assertThat(TwoFactorService.lockFor(2)).hasMinutes(30);
        assertThat(TwoFactorService.lockFor(30)).hasHours(24);
    }

    // ---------- Recuperar contraseña ----------

    @Test
    void resetAnswersTheSameForUnknownEmailsAndSendsNothing() throws Exception {
        String ghost = "nadie-" + UUID.randomUUID() + "@ejemplo.test";
        assertThat(status(postJson("/api/auth/password-reset/request", "{\"email\":\"%s\"}".formatted(ghost)))).isEqualTo(202);
        awaitWorkerIdle();
        assertThat(mail.sent).noneMatch(m -> m.to().equals(ghost));
    }

    @Test
    void resetChangesPasswordOnceClosesSessionsAndStoresOnlyTheHash() throws Exception {
        var a = account("Clínica Reset");
        assertThat(status(postJson("/api/auth/password-reset/request", "{\"email\":\"%s\"}".formatted(a.email())))).isEqualTo(202);
        String token = awaitResetToken(a.email());

        var stored = TenantContext.callAsSystem(() -> db.queryForList("select token_hash from password_reset_token where user_id = ?", String.class, a.id()));
        assertThat(stored).hasSize(1).doesNotContain(token).containsExactly(OpaqueTokens.hash(token));

        String inspect = mvc.perform(postJson("/api/auth/password-reset/inspect", "{\"token\":\"%s\"}".formatted(token))).andReturn().getResponse().getContentAsString();
        assertThat((Boolean) JsonPath.read(inspect, "$.valid")).isTrue();
        assertThat((Boolean) JsonPath.read(inspect, "$.twoFactorRequired")).isFalse();

        // Una contraseña débil no gasta el enlace.
        assertThat(confirmReset(token, "corta", null)).isEqualTo(400);
        assertThat(confirmReset(token, "1234567890", null)).isEqualTo(400);
        assertThat(confirmReset("x" + token, "Nueva-clave-segura-1", null)).isEqualTo(400);

        assertThat(confirmReset(token, "Nueva-clave-segura-1", null)).isEqualTo(204);
        assertThat(status(get("/api/patients").header("Authorization", bearer(a.token())))).isEqualTo(401);
        assertThat(status(postJson("/api/auth/login", "{\"email\":\"%s\",\"password\":\"%s\"}".formatted(a.email(), PASSWORD)))).isEqualTo(401);
        assertThat((String) JsonPath.read(loginRaw(a.email(), "Nueva-clave-segura-1"), "$.accessToken")).isNotBlank();

        // No sirve dos veces.
        assertThat(confirmReset(token, "Otra-clave-segura-2", null)).isEqualTo(400);
    }

    @Test
    void newRequestInvalidatesPreviousLinkAndRequestsAreCappedPerHour() throws Exception {
        var a = account("Clínica Límite");
        postReset(a.email());
        String first = awaitResetToken(a.email());
        mail.sent.clear();
        postReset(a.email());
        String second = awaitResetToken(a.email());
        assertThat(second).isNotEqualTo(first);
        assertThat(confirmReset(first, "Nueva-clave-segura-1", null)).isEqualTo(400);

        postReset(a.email());
        awaitWorkerIdle();
        mail.sent.clear();
        postReset(a.email()); // la cuarta en la hora
        awaitWorkerIdle();
        assertThat(mail.sent).noneMatch(m -> m.subject().contains("Restablece"));
    }

    private void postReset(String email) throws Exception {
        assertThat(status(postJson("/api/auth/password-reset/request", "{\"email\":\"%s\"}".formatted(email)))).isEqualTo(202);
    }

    @Test
    void expiredLinkIsRejected() throws Exception {
        var a = account("Clínica Vencida");
        postReset(a.email());
        String token = awaitResetToken(a.email());
        TenantContext.callAsSystem(() -> db.update("update password_reset_token set expires_at = now() - interval '1 minute' where user_id = ?", a.id()));
        assertThat(confirmReset(token, "Nueva-clave-segura-1", null)).isEqualTo(400);
    }

    @Test
    void resetDoesNotBypassTwoFactor() throws Exception {
        var a = account("Clínica Reset 2FA");
        var enrolled = enroll(a);
        postReset(a.email());
        String token = awaitResetToken(a.email());

        String inspect = mvc.perform(postJson("/api/auth/password-reset/inspect", "{\"token\":\"%s\"}".formatted(token))).andReturn().getResponse().getContentAsString();
        assertThat((Boolean) JsonPath.read(inspect, "$.twoFactorRequired")).isTrue();

        assertThat(confirmReset(token, "Nueva-clave-segura-1", null)).isEqualTo(400);
        assertThat(confirmReset(token, "Nueva-clave-segura-1", "000000")).isEqualTo(400);
        assertThat(confirmReset(token, "Nueva-clave-segura-1", code(a, enrolled.secret()))).isEqualTo(204);

        // La verificación sigue activa después de recuperar.
        assertThat((Boolean) JsonPath.read(loginRaw(a.email(), "Nueva-clave-segura-1"), "$.twoFactorRequired")).isTrue();
    }

    // ---------- Verificación en dos pasos ----------

    @Test
    void clinicUsersCannotEnableTwoFactor() throws Exception {
        org.mockito.Mockito.doCallRealMethod().when(gate).isListed(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
        var a = account("Clínica Sin 2FA");
        assertThat(status(postJson("/api/auth/2fa/setup", "{\"password\":\"%s\"}".formatted(PASSWORD)).header("Authorization", bearer(a.token())))).isEqualTo(403);
        String state = mvc.perform(get("/api/auth/2fa").header("Authorization", bearer(a.token()))).andReturn().getResponse().getContentAsString();
        assertThat((Boolean) JsonPath.read(state, "$.eligible")).isFalse();
        // Recuperar la contraseña sigue disponible para todos.
        postReset(a.email());
        assertThat(awaitResetToken(a.email())).isNotBlank();
    }

    @Test
    void loginRequiresCodeAndNeitherCodeNorChallengeCanBeReplayed() throws Exception {
        var a = account("Clínica 2FA");
        String other = (String) JsonPath.read(loginRaw(a.email(), PASSWORD), "$.accessToken");
        var enrolled = enroll(a);
        assertThat(enrolled.recoveryCodes()).hasSize(3).doesNotHaveDuplicates();
        // Activarla cierra las demás sesiones y conserva la actual.
        assertThat(status(get("/api/auth/me").header("Authorization", bearer(other)))).isEqualTo(401);
        assertThat(status(get("/api/auth/me").header("Authorization", bearer(a.token())))).isEqualTo(200);

        String raw = loginRaw(a.email(), PASSWORD);
        assertThat((Boolean) JsonPath.read(raw, "$.twoFactorRequired")).isTrue();
        assertThat((String) JsonPath.read(raw, "$.accessToken")).isNull();
        String challenge = JsonPath.read(raw, "$.challengeToken");

        // El reto no sirve como sesión.
        assertThat(status(get("/api/auth/me").header("Authorization", bearer(challenge)))).isEqualTo(401);

        String code = code(a, enrolled.secret());
        assertThat(verify(challenge, code)).isEqualTo(200);
        // Ni el reto ni el código sirven dos veces.
        assertThat(verify(challenge, code)).isEqualTo(400);
        String second = JsonPath.read(loginRaw(a.email(), PASSWORD), "$.challengeToken");
        assertThat(verify(second, code)).isEqualTo(400);
    }

    private int verify(String challenge, String code) throws Exception {
        return status(postJson("/api/auth/login/verify", "{\"challengeToken\":\"%s\",\"code\":\"%s\"}".formatted(challenge, code)));
    }

    @Test
    void wrongCodesLockTheAccountEvenAcrossNewChallenges() throws Exception {
        var a = account("Clínica Bloqueo");
        var enrolled = enroll(a);
        int last = 0;
        for (int i = 0; i < 5; i++) {
            // Un reto nuevo en cada intento: abrir retos no reinicia el conteo.
            last = verify(JsonPath.read(loginRaw(a.email(), PASSWORD), "$.challengeToken"), "000000");
        }
        assertThat(last).isEqualTo(429);
        String good = Totp.code(enrolled.secret(), Instant.now().getEpochSecond() / 30);
        assertThat(verify(JsonPath.read(loginRaw(a.email(), PASSWORD), "$.challengeToken"), good)).isEqualTo(429);
        for (int i = 0; i < 100 && mail.sent.stream().noneMatch(m -> m.subject().contains("Intentos fallidos")); i++) Thread.sleep(50);
        assertThat(mail.sent).anyMatch(m -> m.to().equals(a.email()) && m.subject().contains("Intentos fallidos"));
    }

    @Test
    void challengeExpires() throws Exception {
        var a = account("Clínica Reto");
        var enrolled = enroll(a);
        String challenge = JsonPath.read(loginRaw(a.email(), PASSWORD), "$.challengeToken");
        TenantContext.callAsSystem(() -> db.update("update login_challenge set expires_at = now() - interval '1 second' where user_id = ?", a.id()));
        assertThat(verify(challenge, code(a, enrolled.secret()))).isEqualTo(400);
    }

    @Test
    void recoveryCodeWorksOnceAndIsStoredHashed() throws Exception {
        var a = account("Clínica Respaldo");
        var enrolled = enroll(a);
        String recovery = enrolled.recoveryCodes().getFirst();
        var hashes = TenantContext.callAsSystem(() -> db.queryForList("select code_hash from user_recovery_code where user_id = ?", String.class, a.id()));
        assertThat(hashes).hasSize(3).doesNotContain(recovery);

        assertThat(verify(JsonPath.read(loginRaw(a.email(), PASSWORD), "$.challengeToken"), recovery.toLowerCase().replace("-", " "))).isEqualTo(200);
        assertThat(verify(JsonPath.read(loginRaw(a.email(), PASSWORD), "$.challengeToken"), recovery)).isEqualTo(400);

        String status = mvc.perform(get("/api/auth/2fa").header("Authorization", bearer(a.token()))).andReturn().getResponse().getContentAsString();
        assertThat((Integer) JsonPath.read(status, "$.recoveryCodesLeft")).isEqualTo(2);
        for (int i = 0; i < 100 && mail.sent.stream().noneMatch(m -> m.subject().contains("código de respaldo")); i++) Thread.sleep(50);
        assertThat(mail.sent).anyMatch(m -> m.subject().contains("código de respaldo"));
    }

    @Test
    void changesRequirePasswordAndCode() throws Exception {
        var a = account("Clínica Cambios");
        // Sin la contraseña no se puede empezar.
        assertThat(status(postJson("/api/auth/2fa/setup", "{\"password\":\"incorrecta\"}").header("Authorization", bearer(a.token())))).isEqualTo(400);
        var enrolled = enroll(a);
        assertThat(status(postJson("/api/auth/2fa/setup", "{\"password\":\"%s\"}".formatted(PASSWORD)).header("Authorization", bearer(a.token())))).isEqualTo(409);

        String disableWrong = "{\"password\":\"incorrecta\",\"code\":\"%s\"}".formatted(code(a, enrolled.secret()));
        assertThat(status(postJson("/api/auth/2fa/disable", disableWrong).header("Authorization", bearer(a.token())))).isEqualTo(400);
        String noCode = "{\"password\":\"%s\",\"code\":\"000000\"}".formatted(PASSWORD);
        assertThat(status(postJson("/api/auth/2fa/disable", noCode).header("Authorization", bearer(a.token())))).isEqualTo(400);

        var regen = mvc.perform(postJson("/api/auth/2fa/recovery-codes", "{\"password\":\"%s\",\"code\":\"%s\"}".formatted(PASSWORD, code(a, enrolled.secret())))
                .header("Authorization", bearer(a.token()))).andReturn().getResponse();
        assertThat(regen.getStatus()).isEqualTo(200);
        // Los códigos anteriores ya no sirven.
        assertThat(verify(JsonPath.read(loginRaw(a.email(), PASSWORD), "$.challengeToken"), enrolled.recoveryCodes().getFirst())).isEqualTo(400);

        String ok = "{\"password\":\"%s\",\"code\":\"%s\"}".formatted(PASSWORD, code(a, enrolled.secret()));
        assertThat(status(postJson("/api/auth/2fa/disable", ok).header("Authorization", bearer(a.token())))).isEqualTo(204);
        assertThat((String) JsonPath.read(loginRaw(a.email(), PASSWORD), "$.accessToken")).isNotBlank();
    }

    @Test
    void secretIsEncryptedAtRestAndAuditLogIsAppendOnly() throws Exception {
        var a = account("Clínica Cifrado");
        var enrolled = enroll(a);
        String stored = TenantContext.callAsSystem(() -> db.queryForObject("select secret_enc from user_two_factor where user_id = ?", String.class, a.id()));
        assertThat(stored).startsWith("v1:").doesNotContain(Totp.base32(enrolled.secret()));

        var events = TenantContext.callAsSystem(() -> db.queryForList("select event from account_security_event where user_id = ?", String.class, a.id()));
        assertThat(events).contains("TWO_FACTOR_ENABLED");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> TenantContext.callAsSystem(() -> db.update("delete from account_security_event where user_id = ?", a.id())))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
    }

    @Test
    void anotherClinicCannotReadTheseTables() throws Exception {
        var a = account("Clínica Aislada A");
        enroll(a);
        var b = account("Clínica Aislada B");
        UUID clinicB = TenantContext.callAsSystem(() -> db.queryForObject("select clinic_id from app_user where id = ?", UUID.class, b.id()));
        Integer visible = TenantContext.callAs(clinicB, () -> db.queryForObject("select count(*) from user_two_factor where user_id = ?", Integer.class, a.id()));
        assertThat(visible).isZero();
        Integer codes = TenantContext.callAs(clinicB, () -> db.queryForObject("select count(*) from user_recovery_code where user_id = ?", Integer.class, a.id()));
        assertThat(codes).isZero();
    }

    @Test
    void passwordPolicyRejectsWeakChoices() {
        for (String weak : List.of("corta", "1234567890", "aaaaaaaaaaaa", "ababababab", "ana.perez-2026", "x".repeat(73))) {
            org.assertj.core.api.Assertions.assertThatThrownBy(() -> PasswordPolicy.check(weak, "ana.perez@ejemplo.test"))
                    .isInstanceOf(lat.occlus.shared.web.BadRequestException.class);
        }
        PasswordPolicy.check("caballo-bateria-grapa", "ana.perez@ejemplo.test");
        // 80 caracteres de varios bytes pasan el límite de longitud pero no el de bcrypt.
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> PasswordPolicy.check("ñ".repeat(40), "a@ejemplo.test"))
                .isInstanceOf(lat.occlus.shared.web.BadRequestException.class);
    }
}
