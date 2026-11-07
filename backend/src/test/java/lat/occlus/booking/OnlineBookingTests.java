package lat.occlus.booking;

import static lat.occlus.support.ApiClient.bearer;
import static lat.occlus.support.ApiClient.createUserAndLogin;
import static lat.occlus.support.ApiClient.registerClinic;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import lat.occlus.TestcontainersConfiguration;
import lat.occlus.auth.MailTransport;
import lat.occlus.auth.OpaqueTokens;
import lat.occlus.messaging.PatientWhatsApp;
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
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Reserva en línea de punta a punta contra Postgres real con RLS. */
@SpringBootTest(properties = {
        "occlus.booking.public-url=https://reservas.ejemplo.test",
        "occlus.booking.captcha-required=true",
        "occlus.booking.turnstile-site-key=clave-publica",
        "occlus.booking.turnstile-secret=clave-secreta"})
@AutoConfigureMockMvc
@Import({TestcontainersConfiguration.class, OnlineBookingTests.Fakes.class})
class OnlineBookingTests {

    record Sent(String to, String subject, String text) {}

    static class RecordingMail implements MailTransport {
        final List<Sent> sent = new CopyOnWriteArrayList<>();

        @Override
        public boolean configured() {
            return true;
        }

        @Override
        public void send(String to, String subject, String text) {
            sent.add(new Sent(to, subject, text));
        }

        final List<String> html = new CopyOnWriteArrayList<>();

        @Override
        public void send(String to, String subject, String text, String htmlBody) {
            html.add(htmlBody);
            send(to, subject, text);
        }
    }

    static class RecordingWhatsApp implements PatientWhatsApp {
        final List<String> codes = new CopyOnWriteArrayList<>();
        final List<String> notices = new CopyOnWriteArrayList<>();
        volatile boolean on;

        @Override
        public boolean available() {
            return on;
        }

        @Override
        public Optional<String> normalize(String phone) {
            String d = phone.replaceAll("\\D", "");
            return d.length() == 10 && d.startsWith("3") ? Optional.of("57" + d) : Optional.empty();
        }

        @Override
        public boolean sendCode(String phone, String code) {
            codes.add(phone + ":" + code);
            return true;
        }

        @Override
        public boolean sendNotice(String phone, String text) {
            notices.add(text);
            return true;
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Fakes {
        @Bean @Primary RecordingMail recordingMail() {
            return new RecordingMail();
        }

        @Bean @Primary RecordingWhatsApp recordingWhatsApp() {
            return new RecordingWhatsApp();
        }

        @Bean @Primary CaptchaVerifier fakeCaptcha() {
            return (token, ip) -> "humano".equals(token);
        }
    }

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired RecordingMail mail;
    @Autowired RecordingWhatsApp whatsapp;

    private record Clinic(String token, UUID clinicId, UUID dentistId, UUID siteId, String slug) {}

    private final LocalDate tomorrow = LocalDate.now(BookingSlots.BOGOTA).plusDays(1);

    @BeforeEach
    void reset() {
        mail.sent.clear();
        mail.html.clear();
        whatsapp.codes.clear();
        whatsapp.notices.clear();
        whatsapp.on = false;
    }

    private MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder b, String body) {
        return b.contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private MockHttpServletResponse call(MockHttpServletRequestBuilder b) throws Exception {
        return mvc.perform(b).andReturn().getResponse();
    }

    private Clinic clinic() throws Exception {
        String slug = "clinica-" + UUID.randomUUID().toString().substring(0, 8);
        String token = registerClinic(mvc, "Clínica " + slug);
        String me = call(get("/api/auth/me").header("Authorization", bearer(token))).getContentAsString();
        UUID dentist = UUID.fromString(JsonPath.read(me, "$.id"));
        UUID clinicId = TenantContext.callAsSystem(() -> db.queryForObject("select clinic_id from app_user where id = ?", UUID.class, dentist));
        UUID site = TenantContext.callAs(clinicId, () -> db.queryForObject("select id from site where clinic_id = ? limit 1", UUID.class, clinicId));
        var blocks = new StringBuilder();
        for (int day = 1; day <= 7; day++) {
            if (day > 1) blocks.append(',');
            blocks.append("{\"siteId\":\"%s\",\"dayOfWeek\":%d,\"startTime\":\"08:00\",\"endTime\":\"12:00\"}".formatted(site, day));
        }
        assertThat(call(json(put("/api/schedules/" + dentist), "{\"blocks\":[" + blocks + "]}").header("Authorization", bearer(token))).getStatus()).isEqualTo(200);
        var c = new Clinic(token, clinicId, dentist, site, slug);
        assertThat(saveSettings(c, true).getStatus()).isEqualTo(200);
        return c;
    }

    private MockHttpServletResponse saveSettings(Clinic c, boolean enabled) throws Exception {
        return call(json(put("/api/online-booking/settings"), """
                {"enabled":%s,"slug":"%s","visitTypes":["FIRST_VISIT","CONTROL"],"dentistIds":["%s"],"durationMinutes":30,"minNoticeHours":0,"maxDaysAhead":30}"""
                .formatted(enabled, c.slug(), c.dentistId())).header("Authorization", bearer(c.token())));
    }

    private List<String> slotStarts(Clinic c) throws Exception {
        var res = call(get("/api/public/booking/%s/slots?dentistId=%s&from=%s".formatted(c.slug(), c.dentistId(), tomorrow)));
        assertThat(res.getStatus()).isEqualTo(200);
        return JsonPath.read(res.getContentAsString(), "$[*].startsAt");
    }

    private MockHttpServletResponse holdRaw(Clinic c, String startsAt, String captcha) throws Exception {
        return call(json(post("/api/public/booking/%s/hold".formatted(c.slug())), """
                {"dentistId":"%s","siteId":"%s","startsAt":"%s","visitType":"FIRST_VISIT","captchaToken":"%s"}"""
                .formatted(c.dentistId(), c.siteId(), startsAt, captcha)));
    }

    private String hold(Clinic c, String startsAt) throws Exception {
        var res = holdRaw(c, startsAt, "humano");
        assertThat(res.getStatus()).isEqualTo(200);
        return JsonPath.read(res.getContentAsString(), "$.holdToken");
    }

    private MockHttpServletResponse detailsRaw(Clinic c, String hold, String email, String channel, boolean consent) throws Exception {
        return call(json(post("/api/public/booking/%s/details".formatted(c.slug())), """
                {"holdToken":"%s","fullName":"Ana Pérez","phone":"300 123 4567","email":"%s","channel":"%s","consentVersion":"%s","consentAccepted":%s}"""
                .formatted(hold, email, channel, PublicBookingService.CONSENT_VERSION, consent)));
    }

    private String codeSentTo(String email) {
        var m = mail.sent.stream().filter(x -> x.to().equals(email) && x.subject().contains("código")).reduce((a, b) -> b).orElseThrow();
        return m.text().replaceAll("(?s).*Tu código es (\\d{6}).*", "$1");
    }

    private MockHttpServletResponse verifyRaw(Clinic c, String hold, String code) throws Exception {
        return call(json(post("/api/public/booking/%s/verify".formatted(c.slug())), "{\"holdToken\":\"%s\",\"code\":\"%s\"}".formatted(hold, code)));
    }

    private String email() {
        return "paciente-" + UUID.randomUUID().toString().substring(0, 8) + "@ejemplo.test";
    }

    /** Reserva completa hasta quedar pendiente. Devuelve el token de gestión. */
    private String book(Clinic c, String startsAt, String email) throws Exception {
        String h = hold(c, startsAt);
        assertThat(detailsRaw(c, h, email, "EMAIL", true).getStatus()).isEqualTo(204);
        var res = verifyRaw(c, h, codeSentTo(email));
        assertThat(res.getStatus()).isEqualTo(200);
        return JsonPath.read(res.getContentAsString(), "$.manageToken");
    }

    private UUID patient(Clinic c, String phone, String email) throws Exception {
        String doc = String.valueOf(System.nanoTime()).substring(4, 14);
        var res = call(json(post("/api/patients"), """
                {"documentType":"CC","documentNumber":"%s","firstName":"Ana","firstLastName":"Pérez","birthDate":"1990-01-01","sex":"M","regime":"CONTRIBUTIVO","phone":"%s","email":"%s"}"""
                .formatted(doc, phone, email)).header("Authorization", bearer(c.token())));
        assertThat(res.getStatus()).as(res.getContentAsString()).isEqualTo(201);
        return UUID.fromString(JsonPath.read(res.getContentAsString(), "$.id"));
    }

    private int appointments(Clinic c) {
        return TenantContext.callAs(c.clinicId(), () -> db.queryForObject("select count(*) from appointment where clinic_id = ? and status <> 'CANCELLED'", Integer.class, c.clinicId()));
    }

    private int patients(Clinic c) {
        return TenantContext.callAs(c.clinicId(), () -> db.queryForObject("select count(*) from patient where clinic_id = ?", Integer.class, c.clinicId()));
    }

    // ---------- Página pública ----------

    @Test
    void pageIsOffUntilEnabledAndWhenSubscriptionEnds() throws Exception {
        var c = clinic();
        assertThat(call(get("/api/public/booking/" + c.slug())).getStatus()).isEqualTo(200);
        assertThat(saveSettings(c, false).getStatus()).isEqualTo(200);
        assertThat(call(get("/api/public/booking/" + c.slug())).getStatus()).isEqualTo(404);
        assertThat(saveSettings(c, true).getStatus()).isEqualTo(200);

        TenantContext.callAsSystem(() -> db.update("update clinic_subscription set status = 'SUSPENDED', suspended_at = now() where clinic_id = ?", c.clinicId()));
        assertThat(call(get("/api/public/booking/" + c.slug())).getStatus()).isEqualTo(404);
        assertThat(holdRaw(c, tomorrow + "T08:00:00-05:00", "humano").getStatus()).isEqualTo(404);
    }

    @Test
    void slotsShowOnlyHoursAndHideWhoBookedThem() throws Exception {
        var c = clinic();
        var info = call(get("/api/public/booking/" + c.slug())).getContentAsString();
        assertThat((String) JsonPath.read(info, "$.captchaSiteKey")).isEqualTo("clave-publica");
        assertThat((List<String>) JsonPath.read(info, "$.channels")).containsExactly("EMAIL");

        var before = slotStarts(c);
        assertThat(before).isNotEmpty();
        UUID p = patient(c, "3001112222", "conocida@ejemplo.test");
        String taken = before.getFirst();
        assertThat(call(json(post("/api/appointments"), """
                {"patientId":"%s","dentistId":"%s","siteId":"%s","startsAt":"%s","durationMinutes":30,"visitType":"CONTROL","reason":"Dolor de muela"}"""
                .formatted(p, c.dentistId(), c.siteId(), taken)).header("Authorization", bearer(c.token()))).getStatus()).isEqualTo(201);

        var res = call(get("/api/public/booking/%s/slots?dentistId=%s&from=%s".formatted(c.slug(), c.dentistId(), tomorrow))).getContentAsString();
        assertThat(res).doesNotContain(taken).doesNotContain("Dolor").doesNotContain("Pérez").doesNotContain(p.toString());
        List<Map<String, Object>> rows = JsonPath.read(res, "$");
        assertThat(rows.getFirst().keySet()).containsExactlyInAnyOrder("startsAt", "siteId", "siteName");
    }

    @Test
    void captchaIsRequiredAndAnOffGridHourIsRefused() throws Exception {
        var c = clinic();
        String slot = slotStarts(c).getFirst();
        assertThat(holdRaw(c, slot, "robot").getStatus()).isEqualTo(400);
        assertThat(holdRaw(c, tomorrow + "T03:00:00-05:00", "humano").getStatus()).isEqualTo(409);
        assertThat(holdRaw(c, tomorrow + "T08:10:00-05:00", "humano").getStatus()).isEqualTo(409);
    }

    @Test
    void aHeldHourDisappearsAndCannotBeHeldTwiceUntilItExpires() throws Exception {
        var c = clinic();
        String slot = slotStarts(c).getFirst();
        hold(c, slot);
        assertThat(slotStarts(c)).doesNotContain(slot);
        assertThat(holdRaw(c, slot, "humano").getStatus()).isEqualTo(409);

        TenantContext.callAs(c.clinicId(), () -> db.update("update online_booking_request set hold_expires_at = now() - interval '1 second' where clinic_id = ?", c.clinicId()));
        assertThat(slotStarts(c)).contains(slot);
        assertThat(holdRaw(c, slot, "humano").getStatus()).isEqualTo(200);
    }

    @Test
    void concurrentHoldsGetOnlyOneWinner() throws Exception {
        var c = clinic();
        String slot = slotStarts(c).getFirst();
        var results = java.util.stream.IntStream.range(0, 6).parallel().mapToObj(i -> {
            try {
                return holdRaw(c, slot, "humano").getStatus();
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        }).toList();
        assertThat(results.stream().filter(s -> s == 200).count()).isEqualTo(1);
        assertThat(results.stream().filter(s -> s == 409).count()).isEqualTo(5);
    }

    // ---------- Verificación ----------

    @Test
    void consentIsRequiredAndCodeWorksOnceWithoutTouchingPatientsOrAgenda() throws Exception {
        var c = clinic();
        String h = hold(c, slotStarts(c).getFirst());
        String email = email();
        assertThat(detailsRaw(c, h, email, "EMAIL", false).getStatus()).isEqualTo(400);
        assertThat(mail.sent).isEmpty();
        // Sin plantillas aprobadas, WhatsApp no se ofrece.
        assertThat(detailsRaw(c, h, email, "WHATSAPP", true).getStatus()).isEqualTo(400);

        assertThat(detailsRaw(c, h, email, "EMAIL", true).getStatus()).isEqualTo(204);
        String code = codeSentTo(email);
        String wrong = code.equals("000000") ? "000001" : "000000";
        assertThat(verifyRaw(c, h, wrong).getStatus()).isEqualTo(400);
        var ok = verifyRaw(c, h, code);
        assertThat(ok.getStatus()).isEqualTo(200);
        String manage = JsonPath.read(ok.getContentAsString(), "$.manageToken");
        assertThat(verifyRaw(c, h, code).getStatus()).isEqualTo(409);

        // Nada toca al paciente ni a la agenda hasta que la clínica aprueba.
        assertThat(patients(c)).isZero();
        assertThat(appointments(c)).isZero();

        // En la base solo queda la huella del enlace, sin consentimiento perdido.
        var row = TenantContext.callAs(c.clinicId(), () -> db.queryForMap("select manage_token_hash, code_hash, hold_token_hash, consent_version, consent_at, status from online_booking_request where clinic_id = ?", c.clinicId()));
        assertThat(row.get("manage_token_hash")).isEqualTo(OpaqueTokens.hash(manage));
        assertThat(row.get("code_hash")).isNull();
        assertThat(row.get("hold_token_hash")).isNull();
        assertThat(row.get("consent_version")).isEqualTo(PublicBookingService.CONSENT_VERSION);
        assertThat(row.get("consent_at")).isNotNull();
        assertThat(mail.sent).anyMatch(m -> m.to().equals(email) && m.text().contains("https://reservas.ejemplo.test/mi-cita#t=" + manage));
    }

    @Test
    void fiveWrongCodesReleaseTheHour() throws Exception {
        var c = clinic();
        String slot = slotStarts(c).getFirst();
        String h = hold(c, slot);
        String email = email();
        detailsRaw(c, h, email, "EMAIL", true);
        String code = codeSentTo(email);
        String wrong = code.equals("000000") ? "000001" : "000000";
        for (int i = 0; i < 4; i++) assertThat(verifyRaw(c, h, wrong).getStatus()).isEqualTo(400);
        assertThat(verifyRaw(c, h, wrong).getStatus()).isEqualTo(409);
        assertThat(verifyRaw(c, h, code).getStatus()).isEqualTo(409);
        assertThat(slotStarts(c)).contains(slot);
    }

    @Test
    void sendsAreCappedPerHoldAndPerRecipient() throws Exception {
        var c = clinic();
        String email = email();
        String h = hold(c, slotStarts(c).getFirst());
        assertThat(detailsRaw(c, h, email, "EMAIL", true).getStatus()).isEqualTo(204);
        // Reenvío inmediato: hay que esperar.
        assertThat(detailsRaw(c, h, email, "EMAIL", true).getStatus()).isEqualTo(429);

        TenantContext.callAs(c.clinicId(), () -> db.update("update online_booking_request set code_sent_at = now() - interval '1 minute', code_sends = 3 where clinic_id = ?", c.clinicId()));
        assertThat(detailsRaw(c, h, email, "EMAIL", true).getStatus()).isEqualTo(429);

        // El mismo destinatario, desde otra clínica: el tope es entre todas.
        var other = clinic();
        TenantContext.callAs(c.clinicId(), () -> db.update("update online_booking_request set code_sends = 6 where clinic_id = ?", c.clinicId()));
        String h2 = hold(other, slotStarts(other).getFirst());
        assertThat(detailsRaw(other, h2, email, "EMAIL", true).getStatus()).isEqualTo(429);
    }

    @Test
    void whatsappChannelSendsTheCodeToTheVerifiedPhone() throws Exception {
        var c = clinic();
        whatsapp.on = true;
        assertThat((List<String>) JsonPath.read(call(get("/api/public/booking/" + c.slug())).getContentAsString(), "$.channels")).containsExactly("EMAIL", "WHATSAPP");
        String h = hold(c, slotStarts(c).getFirst());
        String email = email();
        assertThat(detailsRaw(c, h, email, "WHATSAPP", true).getStatus()).isEqualTo(204);
        assertThat(mail.sent).isEmpty();
        assertThat(whatsapp.codes).hasSize(1);
        assertThat(whatsapp.codes.getFirst()).startsWith("573001234567:");
        assertThat(verifyRaw(c, h, whatsapp.codes.getFirst().split(":")[1]).getStatus()).isEqualTo(200);
        assertThat(whatsapp.notices).hasSize(1);
        assertThat(mail.sent).isEmpty();
    }

    @Test
    void emailsAreBrandedAndEscapeWhatComesFromTheClinic() throws Exception {
        var c = clinic();
        TenantContext.callAs(c.clinicId(), () -> db.update("update clinic set name = ? where id = ?", "<script>alert(1)</script> & Cía", c.clinicId()));
        String email = email();
        String manage = book(c, slotStarts(c).getFirst(), email);
        assertThat(mail.html).hasSize(2);
        assertThat(mail.html.get(0)).contains("https://reservas.ejemplo.test/logo-correo.png").contains("#246c78").contains(codeSentTo(email));
        assertThat(mail.html.get(1)).contains("href=\"https://reservas.ejemplo.test/mi-cita#t=" + manage + "\"");
        assertThat(mail.html).allSatisfy(h -> assertThat(h).doesNotContain("<script>").contains("&lt;script&gt;alert(1)&lt;/script&gt; &amp; Cía"));
        // Los correos también llevan versión en texto plano, sin marcado.
        assertThat(mail.sent).allSatisfy(m -> assertThat(m.text()).doesNotContain("<table").contains("Enviado por Occlus"));
    }

    // ---------- Recepción ----------

    @Test
    void receptionMatchesPatientAndConfirmsCreatingTheAppointment() throws Exception {
        var c = clinic();
        String slot = slotStarts(c).getFirst();
        String email = email();
        String manage = book(c, slot, email);
        assertThat(slotStarts(c)).doesNotContain(slot);

        String reception = createUserAndLogin(mvc, c.token(), "RECEPTION", false);
        String assistant = createUserAndLogin(mvc, c.token(), "ASSISTANT", false);
        assertThat(call(get("/api/online-booking/requests").header("Authorization", bearer(assistant))).getStatus()).isEqualTo(403);
        assertThat(call(get("/api/online-booking/settings").header("Authorization", bearer(reception))).getStatus()).isEqualTo(403);

        UUID p = patient(c, "+57 300 123 4567", "otro@ejemplo.test");
        String inbox = call(get("/api/online-booking/requests").header("Authorization", bearer(reception))).getContentAsString();
        assertThat((String) JsonPath.read(inbox, "$[0].fullName")).isEqualTo("Ana Pérez");
        assertThat((String) JsonPath.read(inbox, "$[0].matches[0].id")).isEqualTo(p.toString());
        String id = JsonPath.read(inbox, "$[0].id");

        var conf = call(json(post("/api/online-booking/requests/%s/confirm".formatted(id)), "{\"patientId\":\"%s\"}".formatted(p)).header("Authorization", bearer(reception))); assertThat(conf.getStatus()).as(conf.getContentAsString()).isEqualTo(204);
        assertThat(appointments(c)).isEqualTo(1);
        assertThat(mail.sent).anyMatch(m -> m.to().equals(email) && m.subject().contains("confirmada"));
        // Ya resuelta: no se puede confirmar de nuevo ni aparece en la bandeja.
        assertThat(call(json(post("/api/online-booking/requests/%s/confirm".formatted(id)), "{\"patientId\":\"%s\"}".formatted(p)).header("Authorization", bearer(reception))).getStatus()).isEqualTo(404);
        assertThat((List<?>) JsonPath.read(call(get("/api/online-booking/requests").header("Authorization", bearer(reception))).getContentAsString(), "$")).isEmpty();

        String view = call(json(post("/api/public/booking/manage/inspect"), "{\"token\":\"%s\"}".formatted(manage))).getContentAsString();
        assertThat((String) JsonPath.read(view, "$.status")).isEqualTo("CONFIRMED");
        assertThat(view).doesNotContain("Ana").doesNotContain(p.toString());
    }

    @Test
    void anotherAppointmentInThatHourBlocksConfirmation() throws Exception {
        var c = clinic();
        String slot = slotStarts(c).getFirst();
        book(c, slot, email());
        UUID p = patient(c, "3009998888", "dos@ejemplo.test");
        // La agenda interna puede ocupar la hora mientras la solicitud espera.
        assertThat(call(json(post("/api/appointments"), """
                {"patientId":"%s","dentistId":"%s","siteId":"%s","startsAt":"%s","durationMinutes":30,"visitType":"CONTROL"}"""
                .formatted(p, c.dentistId(), c.siteId(), slot)).header("Authorization", bearer(c.token()))).getStatus()).isEqualTo(201);
        String id = JsonPath.read(call(get("/api/online-booking/requests").header("Authorization", bearer(c.token()))).getContentAsString(), "$[0].id");
        assertThat(call(json(post("/api/online-booking/requests/%s/confirm".formatted(id)), "{\"patientId\":\"%s\"}".formatted(p)).header("Authorization", bearer(c.token()))).getStatus()).isEqualTo(409);
        assertThat(appointments(c)).isEqualTo(1);
    }

    @Test
    void rejectingReleasesTheHourAndKillsTheLink() throws Exception {
        var c = clinic();
        String slot = slotStarts(c).getFirst();
        String email = email();
        String manage = book(c, slot, email);
        String id = JsonPath.read(call(get("/api/online-booking/requests").header("Authorization", bearer(c.token()))).getContentAsString(), "$[0].id");
        assertThat(call(json(post("/api/online-booking/requests/%s/reject".formatted(id)), "{\"reason\":\"La doctora no atiende ese día\"}").header("Authorization", bearer(c.token()))).getStatus()).isEqualTo(204);
        assertThat(slotStarts(c)).contains(slot);
        assertThat(call(json(post("/api/public/booking/manage/inspect"), "{\"token\":\"%s\"}".formatted(manage))).getStatus()).isEqualTo(400);
        assertThat(mail.sent).anyMatch(m -> m.to().equals(email) && m.text().contains("La doctora no atiende ese día"));
    }

    // ---------- Enlace del paciente ----------

    @Test
    void linkReschedulesThroughReceptionAndCancelsTheAppointment() throws Exception {
        var c = clinic();
        var free = slotStarts(c);
        String email = email();
        String manage = book(c, free.get(0), email);
        UUID p = patient(c, "3005556666", "tres@ejemplo.test");
        String id = JsonPath.read(call(get("/api/online-booking/requests").header("Authorization", bearer(c.token()))).getContentAsString(), "$[0].id");
        assertThat(call(json(post("/api/online-booking/requests/%s/confirm".formatted(id)), "{\"patientId\":\"%s\"}".formatted(p)).header("Authorization", bearer(c.token()))).getStatus()).isEqualTo(204);
        assertThat(appointments(c)).isEqualTo(1);

        // Cambiar una cita confirmada la libera y vuelve a recepción.
        var options = call(json(post("/api/public/booking/manage/slots"), "{\"token\":\"%s\",\"from\":\"%s\"}".formatted(manage, tomorrow))).getContentAsString();
        assertThat(options).doesNotContain("\"" + free.get(0) + "\"");
        assertThat(call(json(post("/api/public/booking/manage/reschedule"), "{\"token\":\"%s\",\"siteId\":\"%s\",\"startsAt\":\"%s\"}".formatted(manage, c.siteId(), free.get(1)))).getStatus()).isEqualTo(204);
        assertThat(appointments(c)).isZero();
        assertThat((String) JsonPath.read(call(json(post("/api/public/booking/manage/inspect"), "{\"token\":\"%s\"}".formatted(manage))).getContentAsString(), "$.status")).isEqualTo("PENDING");
        assertThat(slotStarts(c)).contains(free.get(0)).doesNotContain(free.get(1));

        assertThat(call(json(post("/api/public/booking/manage/cancel"), "{\"token\":\"%s\"}".formatted(manage))).getStatus()).isEqualTo(204);
        assertThat(slotStarts(c)).contains(free.get(1));
        // Ya no sirve para nada más.
        assertThat(call(json(post("/api/public/booking/manage/cancel"), "{\"token\":\"%s\"}".formatted(manage))).getStatus()).isEqualTo(400);
    }

    @Test
    void linkExpiresWhenTheAppointmentPasses() throws Exception {
        var c = clinic();
        String manage = book(c, slotStarts(c).getFirst(), email());
        TenantContext.callAs(c.clinicId(), () -> db.update("update online_booking_request set starts_at = now() - interval '2 hours', ends_at = now() - interval '1 hour' where clinic_id = ?", c.clinicId()));
        assertThat(call(json(post("/api/public/booking/manage/cancel"), "{\"token\":\"%s\"}".formatted(manage))).getStatus()).isEqualTo(400);
    }

    // ---------- Aislamiento y retención ----------

    @Test
    void anotherClinicCannotSeeOrDecideARequest() throws Exception {
        var a = clinic();
        var b = clinic();
        book(a, slotStarts(a).getFirst(), email());
        String id = JsonPath.read(call(get("/api/online-booking/requests").header("Authorization", bearer(a.token()))).getContentAsString(), "$[0].id");
        assertThat((List<?>) JsonPath.read(call(get("/api/online-booking/requests").header("Authorization", bearer(b.token()))).getContentAsString(), "$")).isEmpty();
        UUID p = patient(b, "3007778888", "cuatro@ejemplo.test");
        assertThat(call(json(post("/api/online-booking/requests/%s/confirm".formatted(id)), "{\"patientId\":\"%s\"}".formatted(p)).header("Authorization", bearer(b.token()))).getStatus()).isEqualTo(404);
        Integer visible = TenantContext.callAs(b.clinicId(), () -> db.queryForObject("select count(*) from online_booking_request", Integer.class));
        assertThat(visible).isZero();
    }

    @Test
    void slugIsUniqueAndOldRequestsAreErased(@Autowired PublicBookingService service) throws Exception {
        var a = clinic();
        var b = clinic();
        assertThat(call(json(put("/api/online-booking/settings"), """
                {"enabled":true,"slug":"%s","visitTypes":["CONTROL"],"dentistIds":["%s"],"durationMinutes":30,"minNoticeHours":0,"maxDaysAhead":30}"""
                .formatted(a.slug(), b.dentistId())).header("Authorization", bearer(b.token()))).getStatus()).isEqualTo(409);

        book(a, slotStarts(a).getFirst(), email());
        TenantContext.callAs(a.clinicId(), () -> db.update("""
                update online_booking_request set status = 'REJECTED', starts_at = now() - interval '40 days', ends_at = now() - interval '39 days',
                    created_at = now() - interval '41 days' where clinic_id = ?""", a.clinicId()));
        service.cleanup();
        Integer left = TenantContext.callAs(a.clinicId(), () -> db.queryForObject("select count(*) from online_booking_request", Integer.class));
        assertThat(left).isZero();
    }
}
