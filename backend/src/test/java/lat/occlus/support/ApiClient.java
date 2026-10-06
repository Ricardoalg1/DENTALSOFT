package lat.occlus.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/** Atajos para las pruebas de integración: registrar clínicas y obtener tokens. */
public final class ApiClient {

    private ApiClient() {}

    public static String registerClinic(MockMvc mvc, String clinicName) throws Exception {
        String body = """
                {"clinicName":"%s","fullName":"Admin","email":"%s","password":"secreto123"}"""
                .formatted(clinicName, uniqueEmail("admin"));
        String json = mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(json, "$.accessToken");
    }

    public static String uniqueEmail(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 8) + "@test.co";
    }

    public static String bearer(String token) {
        return "Bearer " + token;
    }
}
