package lat.occlus.patient;

import static lat.occlus.support.ApiClient.bearer;
import static lat.occlus.support.ApiClient.registerClinic;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import lat.occlus.TestcontainersConfiguration;
import lat.occlus.auth.MailTransport;
import lat.occlus.support.ApiClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/** Saludo de cumpleaños: solo con autorización del paciente y de la clínica, uno por año y con baja desde el correo. */
@SpringBootTest(properties = "occlus.account-security.app-url=https://app.ejemplo.test")
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, BirthdayEmailTests.MailConfig.class})
class BirthdayEmailTests {

    record Sent(String to, String subject, String text, String html) {}

    static class RecordingTransport implements MailTransport {
        final List<Sent> sent = new CopyOnWriteArrayList<>();

        @Override
        public boolean configured() {
            return true;
        }

        @Override
        public void send(String to, String subject, String text) {
            sent.add(new Sent(to, subject, text, null));
        }

        @Override
        public void send(String to, String subject, String text, String html) {
            sent.add(new Sent(to, subject, text, html));
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class MailConfig {
        @Bean
        @Primary
        RecordingTransport recordingTransport() {
            return new RecordingTransport();
        }
    }

    @Autowired MockMvc mvc;
    @Autowired RecordingTransport mail;
    @Autowired BirthdayEmails birthdays;

    @Test
    void sendsOnceToConsentingPatientsAndHonorsTheOptOutLink() throws Exception {
        String token = registerClinic(mvc, "Clínica Sonrisas");
        LocalDate today = LocalDate.now(BirthdayEmails.BOGOTA);
        String birth = today.minusYears(30).toString();
        String withConsent = ApiClient.uniqueEmail("cumple");
        String withoutConsent = ApiClient.uniqueEmail("sin");
        String otherDay = ApiClient.uniqueEmail("otro");
        String consenting = createPatient(token, "880001", "Laura", birth, withConsent, true);
        createPatient(token, "880002", "Pedro", birth, withoutConsent, false);
        createPatient(token, "880003", "Marta", today.minusYears(30).plusDays(3).toString(), otherDay, true);

        // Con la clínica apagada no sale nada.
        birthdays.sendFor(today);
        assertThat(sentTo(withConsent)).isEmpty();

        mvc.perform(put("/api/outreach/birthday-emails").header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(true))
                .andExpect(jsonPath("$.consentedPatients").value(2));

        birthdays.sendFor(today);
        birthdays.sendFor(today); // Una segunda corrida el mismo día no repite.
        List<Sent> sent = sentTo(withConsent);
        assertThat(sent).hasSize(1);
        assertThat(sent.getFirst().subject()).contains("Clínica Sonrisas");
        assertThat(sent.getFirst().html()).contains("¡Feliz cumpleaños, Laura!").contains("baja-cumpleanos#t=");
        assertThat(sentTo(withoutConsent)).isEmpty();
        assertThat(sentTo(otherDay)).isEmpty();
        mvc.perform(get("/api/outreach/birthday-emails").header("Authorization", bearer(token)))
                .andExpect(jsonPath("$.sentThisYear").value(1));

        // La baja funciona sin sesión, retira la autorización y queda en el historial del paciente.
        String optOut = sent.getFirst().text().replaceAll("(?s).*baja-cumpleanos#t=(\\S+).*", "$1");
        mvc.perform(post("/api/public/birthday-emails/optout").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"" + optOut + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.clinicName").value("Clínica Sonrisas"));
        mvc.perform(get("/api/patients/" + consenting).header("Authorization", bearer(token)))
                .andExpect(jsonPath("$.birthdayEmailConsent").value(false))
                .andExpect(jsonPath("$.birthdayEmailConsentAt").doesNotExist());

        // Un enlace inventado no revela nada.
        mvc.perform(post("/api/public/birthday-emails/optout").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"inventado\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.clinicName").doesNotExist());
    }

    @Test
    void onlyAdminsTurnItOn() throws Exception {
        String admin = registerClinic(mvc, "Clínica Recepción");
        String reception = ApiClient.createUserAndLogin(mvc, admin, "RECEPTION", false);
        mvc.perform(get("/api/outreach/birthday-emails").header("Authorization", bearer(reception)))
                .andExpect(status().isOk());
        mvc.perform(put("/api/outreach/birthday-emails").header("Authorization", bearer(reception))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":true}"))
                .andExpect(status().isForbidden());
    }

    private List<Sent> sentTo(String email) {
        return mail.sent.stream().filter(s -> s.to().equals(email)).toList();
    }

    private String createPatient(String token, String doc, String firstName, String birthDate, String email,
                                 boolean consent) throws Exception {
        String body = """
                {"documentType":"CC","documentNumber":"%s","firstName":"%s","firstLastName":"Prueba",
                 "birthDate":"%s","sex":"M","phone":"3001234567","email":"%s","regime":"CONTRIBUTIVO",
                 "insurer":"Sura","birthdayEmailConsent":%s}""".formatted(doc, firstName, birthDate, email, consent);
        String json = mvc.perform(post("/api/patients").header("Authorization", bearer(token))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(json, "$.id");
    }
}
