package lat.occlus.auth;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.UUID;
import lat.occlus.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class AuthFlowTests {

    @Autowired
    MockMvc mvc;

    @Test
    void registerLoginAndMe() throws Exception {
        String email = unique("admin");
        register("Clínica Sonrisas", email);

        String token = login(email, "secreto123");
        mvc.perform(get("/api/auth/me").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(email))
                .andExpect(jsonPath("$.role").value("ADMIN"))
                .andExpect(jsonPath("$.clinicName").value("Clínica Sonrisas"));

        mvc.perform(get("/api/sites").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Sede principal"));
    }

    @Test
    void rejectsBadCredentialsAndMissingToken() throws Exception {
        String email = unique("admin");
        register("Clínica A", email);

        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json("email", email, "password", "incorrecta")))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void duplicateEmailIsConflict() throws Exception {
        String email = unique("dup");
        register("Clínica B", email);
        mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(registerBody("Otra", email)))
                .andExpect(status().isConflict());
    }

    @Test
    void nonAdminCannotManageUsers() throws Exception {
        String adminEmail = unique("admin");
        String adminToken = register("Clínica C", adminEmail);

        String dentistEmail = unique("odonto");
        mvc.perform(post("/api/users").header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("email", dentistEmail, "fullName", "Dra. Pérez", "role", "DENTIST", "password", "secreto123")))
                .andExpect(status().isCreated());

        String dentistToken = login(dentistEmail, "secreto123");
        mvc.perform(get("/api/users").header("Authorization", bearer(dentistToken)))
                .andExpect(status().isForbidden());
    }

    @Test
    void clinicsAreIsolated() throws Exception {
        String tokenA = register("Clínica A", unique("a"));
        String tokenB = register("Clínica B", unique("b"));

        String userInA = JsonPath.read(mvc.perform(get("/api/users").header("Authorization", bearer(tokenA)))
                .andReturn().getResponse().getContentAsString(), "$[0].id");

        // El admin de B no puede ver ni modificar usuarios de A.
        mvc.perform(patch("/api/users/" + userInA).header("Authorization", bearer(tokenB))
                        .contentType(MediaType.APPLICATION_JSON).content(json("fullName", "Hackeado")))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/users").header("Authorization", bearer(tokenB)))
                .andExpect(jsonPath("$.length()").value(1));
    }

    private String register(String clinic, String email) throws Exception {
        String body = mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content(registerBody(clinic, email)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.accessToken");
    }

    private String login(String email, String password) throws Exception {
        String body = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json("email", email, "password", password)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.accessToken");
    }

    private static String registerBody(String clinic, String email) {
        return json("clinicName", clinic, "fullName", "Admin", "email", email, "password", "secreto123");
    }

    /** Construye un objeto JSON plano a partir de pares clave/valor (valores sin comillas internas). */
    private static String json(String... kv) {
        var sb = new StringBuilder("{");
        for (int i = 0; i < kv.length; i += 2) {
            if (i > 0) sb.append(',');
            sb.append('"').append(kv[i]).append("\":\"").append(kv[i + 1]).append('"');
        }
        return sb.append('}').toString();
    }

    private static String unique(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 8) + "@test.co";
    }

    private static String bearer(String token) {
        return "Bearer " + token;
    }
}
