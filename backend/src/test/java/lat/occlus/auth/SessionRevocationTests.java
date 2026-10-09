package lat.occlus.auth;

import static lat.occlus.support.ApiClient.bearer;
import static lat.occlus.support.ApiClient.createUserAndLogin;
import static lat.occlus.support.ApiClient.registerClinic;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.time.Instant;
import java.util.UUID;
import lat.occlus.TestcontainersConfiguration;
import lat.occlus.support.ApiClient;
import lat.occlus.support.PlatformTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.test.web.servlet.MockMvc;

/** Un token firmado no basta: la sesión debe seguir viva en la base de datos. */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class SessionRevocationTests {

    @Autowired MockMvc mvc;
    @Autowired JwtEncoder encoder;

    private int codeOf(String path, String token) throws Exception {
        return mvc.perform(get(path).header("Authorization", bearer(token))).andReturn().getResponse().getStatus();
    }

    @Test
    void logoutKillsOnlyThatSession() throws Exception {
        String admin = registerClinic(mvc, "Clínica Sesiones");
        String email = JsonPath.read(mvc.perform(get("/api/auth/me").header("Authorization", bearer(admin)))
                .andReturn().getResponse().getContentAsString(), "$.email");
        String second = PlatformTestSupport.login(mvc, email, "secreto123");

        mvc.perform(post("/api/auth/logout").header("Authorization", bearer(admin))).andExpect(status().isNoContent());
        assertThat(codeOf("/api/patients", admin)).isEqualTo(401); // el token «robado» ya no sirve
        assertThat(codeOf("/api/auth/me", admin)).isEqualTo(401);
        assertThat(codeOf("/api/patients", second)).isEqualTo(200); // la otra sesión sigue
    }

    @Test
    void sessionsCanBeListedAndRevokedIndividuallyOrAllOthers() throws Exception {
        String a = registerClinic(mvc, "Clínica Dispositivos");
        String email = JsonPath.read(mvc.perform(get("/api/auth/me").header("Authorization", bearer(a)))
                .andReturn().getResponse().getContentAsString(), "$.email");
        String b = PlatformTestSupport.login(mvc, email, "secreto123");
        String c = PlatformTestSupport.login(mvc, email, "secreto123");

        String list = mvc.perform(get("/api/auth/sessions").header("Authorization", bearer(b))).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3)).andReturn().getResponse().getContentAsString();
        assertThat((java.util.List<?>) JsonPath.read(list, "$[?(@.current == true)]")).hasSize(1);
        String aId = ((java.util.List<String>) JsonPath.read(list, "$[?(@.current == false)].id")).get(0);

        mvc.perform(delete("/api/auth/sessions/" + aId).header("Authorization", bearer(b))).andExpect(status().isNoContent());
        // No se pueden cerrar sesiones ajenas ni inexistentes.
        mvc.perform(delete("/api/auth/sessions/" + UUID.randomUUID()).header("Authorization", bearer(b))).andExpect(status().isNotFound());
        mvc.perform(delete("/api/auth/sessions/" + aId).header("Authorization", bearer(b))).andExpect(status().isNotFound());

        mvc.perform(post("/api/auth/sessions/revoke-others").header("Authorization", bearer(b))).andExpect(status().isNoContent());
        assertThat(codeOf("/api/patients", b)).isEqualTo(200);
        assertThat(codeOf("/api/patients", a) == 401 || codeOf("/api/patients", c) == 401).isTrue();
        assertThat(codeOf("/api/patients", a)).isEqualTo(401);
        assertThat(codeOf("/api/patients", c)).isEqualTo(401);
    }

    @Test
    void deactivatingOrChangingTheRoleCutsAccessImmediately() throws Exception {
        String admin = registerClinic(mvc, "Clínica Roles");
        String[] first = newUser(admin, "RECEPTION");
        assertThat(codeOf("/api/patients", first[1])).isEqualTo(200);

        // Cambio de rol: el token viejo (con el rol anterior) deja de valer; con uno nuevo ya tiene el rol nuevo.
        mvc.perform(patch("/api/users/" + first[0]).header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"ASSISTANT\"}")).andExpect(status().isOk());
        assertThat(codeOf("/api/patients", first[1])).isEqualTo(401);

        String[] second = newUser(admin, "DENTIST");
        mvc.perform(patch("/api/users/" + second[0]).header("Authorization", bearer(admin)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"active\":false}")).andExpect(status().isOk());
        assertThat(codeOf("/api/patients", second[1])).isEqualTo(401);
        // Y no puede volver a entrar mientras esté inactivo.
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"password\":\"secreto123\"}".formatted(second[2]))).andExpect(status().isUnauthorized());
    }

    @Test
    void changingThePasswordClosesEveryOtherSession() throws Exception {
        String admin = registerClinic(mvc, "Clínica Clave");
        String email = JsonPath.read(mvc.perform(get("/api/auth/me").header("Authorization", bearer(admin)))
                .andReturn().getResponse().getContentAsString(), "$.email");
        String other = PlatformTestSupport.login(mvc, email, "secreto123");
        String fresh = PlatformTestSupport.changePassword(mvc, admin, "secreto123", "Otra-clave-456");
        assertThat(codeOf("/api/patients", fresh)).isEqualTo(200);
        assertThat(codeOf("/api/patients", admin)).isEqualTo(401);
        assertThat(codeOf("/api/patients", other)).isEqualTo(401);
    }

    @Test
    void aValidlySignedTokenWithoutALiveSessionIsRejected() throws Exception {
        String admin = registerClinic(mvc, "Clínica Falsa");
        String me = mvc.perform(get("/api/auth/me").header("Authorization", bearer(admin))).andReturn().getResponse().getContentAsString();
        String userId = JsonPath.read(me, "$.id");
        String clinicId = JsonPath.read(me, "$.clinicId");

        // Mismo secreto y mismos datos, pero sin sesión (anterior a las sesiones) o con una inventada.
        assertThat(codeOf("/api/patients", forge(userId, clinicId, null))).isEqualTo(401);
        assertThat(codeOf("/api/patients", forge(userId, clinicId, UUID.randomUUID().toString()))).isEqualTo(401);
        // La sesión de OTRO usuario tampoco sirve para este.
        String other = JsonPath.read(mvc.perform(get("/api/auth/sessions").header("Authorization", bearer(registerClinic(mvc, "Otra"))))
                .andReturn().getResponse().getContentAsString(), "$[0].id");
        assertThat(codeOf("/api/patients", forge(userId, clinicId, other))).isEqualTo(401);
    }

    private String forge(String userId, String clinicId, String sid) {
        var b = JwtClaimsSet.builder().issuer("occlus").issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(600))
                .subject(userId).claim("clinic_id", clinicId).claim("role", "ADMIN");
        if (sid != null) b.claim("sid", sid);
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), b.build())).getTokenValue();
    }

    /** {id, token, email} de un usuario nuevo con la contraseña «secreto123». */
    private String[] newUser(String adminToken, String role) throws Exception {
        String email = ApiClient.uniqueEmail(role.toLowerCase());
        String body = mvc.perform(post("/api/users").header("Authorization", bearer(adminToken)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"fullName\":\"Usuario %s\",\"role\":\"%s\",\"password\":\"secreto123\"}".formatted(email, role, role)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return new String[] {JsonPath.read(body, "$.id"), PlatformTestSupport.login(mvc, email, "secreto123"), email};
    }
}
