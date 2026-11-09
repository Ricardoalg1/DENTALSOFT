package lat.occlus.auth;

import static lat.occlus.support.ApiClient.bearer;
import static lat.occlus.support.ApiClient.registerClinic;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import lat.occlus.TestcontainersConfiguration;
import lat.occlus.shared.security.JwtProperties;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Pruebas de intrusión sobre el JWT: cada ataque conocido fabrica un token a mano y debe recibir 401.
 * Incluye la inyección del parámetro "kid" (recorrido de rutas hacia /dev/null para firmar con una llave
 * vacía, e inyección SQL para elegir la llave), "alg": "none", cambio de algoritmo, llaves remotas (jku/jwk)
 * y escalada de rol con la firma correcta.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class JwtForgeryTests {

    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64D = Base64.getUrlDecoder();

    @Autowired MockMvc mvc;
    @Autowired JwtProperties jwt;
    @Autowired ObjectMapper json;

    private int status(String token) throws Exception {
        return mvc.perform(get("/api/patients").header("Authorization", bearer(token))).andReturn().getResponse().getStatus();
    }

    private ObjectNode claimsOf(String token) {
        return (ObjectNode) json.readTree(B64D.decode(token.split("\\.")[1]));
    }

    private String sign(String headerJson, ObjectNode claims, String macAlg, byte[] key) throws Exception {
        String unsigned = B64.encodeToString(headerJson.getBytes(StandardCharsets.UTF_8)) + "."
                + B64.encodeToString(json.writeValueAsBytes(claims));
        if (macAlg == null) return unsigned + ".";
        Mac mac = Mac.getInstance(macAlg);
        mac.init(new SecretKeySpec(key, macAlg));
        return unsigned + "." + B64.encodeToString(mac.doFinal(unsigned.getBytes(StandardCharsets.UTF_8)));
    }

    private byte[] realKey() {
        return jwt.secret().getBytes(StandardCharsets.UTF_8);
    }

    @Test
    void legitimateTokenWorks() throws Exception {
        String token = registerClinic(mvc, "Clínica JWT Base");
        assertThat(status(token)).isEqualTo(200);
        // Firmado de nuevo con la llave real y la misma cabecera: sigue valiendo (el arnés de la prueba es correcto).
        assertThat(status(sign("{\"alg\":\"HS256\"}", claimsOf(token), "HmacSHA256", realKey()))).isEqualTo(200);
    }

    @Test
    void kidPathTraversalToEmptyKeyIsRejected() throws Exception {
        var claims = claimsOf(registerClinic(mvc, "Clínica JWT Kid"));
        // Llave vacía: HMAC rellena con ceros, así que un byte 0 equivale a firmar con el contenido de /dev/null.
        for (String kid : new String[] {"../../../../../../dev/null", "/dev/null", "../../../../proc/sys/kernel/randomize_va_space"}) {
            String header = "{\"alg\":\"HS256\",\"kid\":\"" + kid + "\"}";
            assertThat(status(sign(header, claims, "HmacSHA256", new byte[1]))).as(kid).isEqualTo(401);
            assertThat(status(sign(header, claims, "HmacSHA256", "0".getBytes(StandardCharsets.UTF_8)))).as(kid).isEqualTo(401);
        }
    }

    @Test
    void kidSqlInjectionIsRejected() throws Exception {
        var claims = claimsOf(registerClinic(mvc, "Clínica JWT SQL"));
        String header = "{\"alg\":\"HS256\",\"kid\":\"x' UNION SELECT 'atacante' -- \"}";
        assertThat(status(sign(header, claims, "HmacSHA256", "atacante".getBytes(StandardCharsets.UTF_8)))).isEqualTo(401);
    }

    @Test
    void kidIsRejectedEvenWithTheRealKey() throws Exception {
        // Occlus nunca emite "kid": su presencia delata un token fabricado, aunque se haya firmado bien.
        var claims = claimsOf(registerClinic(mvc, "Clínica JWT Kid Real"));
        assertThat(status(sign("{\"alg\":\"HS256\",\"kid\":\"1\"}", claims, "HmacSHA256", realKey()))).isEqualTo(401);
    }

    @Test
    void algNoneAndAlgorithmSwitchAreRejected() throws Exception {
        var claims = claimsOf(registerClinic(mvc, "Clínica JWT Alg"));
        assertThat(status(sign("{\"alg\":\"none\"}", claims, null, null))).isEqualTo(401);
        assertThat(status(sign("{\"alg\":\"NoNe\"}", claims, null, null))).isEqualTo(401);
        assertThat(status(sign("{\"alg\":\"HS512\"}", claims, "HmacSHA512", realKey()))).isEqualTo(401);
        assertThat(status(sign("{\"alg\":\"HS384\"}", claims, "HmacSHA384", realKey()))).isEqualTo(401);
    }

    @Test
    void remoteKeyHeadersAreRejected() throws Exception {
        var claims = claimsOf(registerClinic(mvc, "Clínica JWT JKU"));
        byte[] attacker = "llave-del-atacante-con-32-caracteres!!".getBytes(StandardCharsets.UTF_8);
        String k = B64.encodeToString(attacker);
        assertThat(status(sign("{\"alg\":\"HS256\",\"jku\":\"https://atacante.example/jwks.json\"}", claims, "HmacSHA256", attacker))).isEqualTo(401);
        assertThat(status(sign("{\"alg\":\"HS256\",\"jwk\":{\"kty\":\"oct\",\"k\":\"" + k + "\"}}", claims, "HmacSHA256", attacker))).isEqualTo(401);
        assertThat(status(sign("{\"alg\":\"HS256\",\"x5u\":\"https://atacante.example/cert.pem\"}", claims, "HmacSHA256", attacker))).isEqualTo(401);
    }

    @Test
    void foreignIssuerIsRejected() throws Exception {
        var claims = claimsOf(registerClinic(mvc, "Clínica JWT Iss"));
        claims.put("iss", "atacante");
        assertThat(status(sign("{\"alg\":\"HS256\"}", claims, "HmacSHA256", realKey()))).isEqualTo(401);
        claims.remove("iss");
        assertThat(status(sign("{\"alg\":\"HS256\"}", claims, "HmacSHA256", realKey()))).isEqualTo(401);
    }

    @Test
    void escalatedClaimsAreRejectedEvenWithTheRealKey() throws Exception {
        // Autenticar no es autorizar: aunque se filtrara el secreto, el rol y la clínica se contrastan con la base.
        String reception = lat.occlus.support.ApiClient.createUserAndLogin(mvc, registerClinic(mvc, "Clínica JWT Rol"), "RECEPTION", false);
        var claims = claimsOf(reception);
        claims.put("role", "ADMIN");
        assertThat(status(sign("{\"alg\":\"HS256\"}", claims, "HmacSHA256", realKey()))).isEqualTo(401);

        var otherClinic = claimsOf(reception);
        otherClinic.put("clinic_id", UUID.randomUUID().toString());
        assertThat(status(sign("{\"alg\":\"HS256\"}", otherClinic, "HmacSHA256", realKey()))).isEqualTo(401);
    }

    @Test
    void tamperedSignatureIsRejected() throws Exception {
        String token = lat.occlus.support.ApiClient.createUserAndLogin(mvc, registerClinic(mvc, "Clínica JWT Firma"), "RECEPTION", false);
        var claims = claimsOf(token);
        claims.put("role", "ADMIN"); // recepción se hace pasar por administrador sin volver a firmar
        String[] parts = token.split("\\.");
        String forged = parts[0] + "." + B64.encodeToString(json.writeValueAsBytes(claims)) + "." + parts[2];
        assertThat(status(forged)).isEqualTo(401);
    }
}
