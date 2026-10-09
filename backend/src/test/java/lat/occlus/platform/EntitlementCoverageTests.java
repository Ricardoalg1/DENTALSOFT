package lat.occlus.platform;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.Set;
import lat.occlus.TestcontainersConfiguration;
import lat.occlus.appointment.AppointmentController;
import lat.occlus.appointment.ScheduleController;
import lat.occlus.patient.PatientController;
import lat.occlus.site.SiteController;
import lat.occlus.user.ProfessionalController;
import lat.occlus.user.UserController;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/**
 * Red de seguridad: ningún endpoint puede quedar sin decidir a qué módulo pertenece.
 * Si agregas un controlador nuevo y no lo anotas, esta prueba falla y te dice cuál.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class EntitlementCoverageTests {

    /** Núcleo: siempre disponible mientras la suscripción dé acceso (se valida su estado, no un módulo). */
    private static final Set<Class<?>> CORE = Set.of(PatientController.class, AppointmentController.class,
            ScheduleController.class, SiteController.class, UserController.class, ProfessionalController.class,
            AnnouncementController.class);

    @Autowired
    @Qualifier("requestMappingHandlerMapping")
    RequestMappingHandlerMapping mapping;

    @Test
    void everyEndpointIsEitherCoreModuleOrExempt() {
        var undecided = new ArrayList<String>();
        var contradictory = new ArrayList<String>();
        int checked = 0;
        for (var entry : mapping.getHandlerMethods().entrySet()) {
            var method = entry.getValue();
            Class<?> type = method.getBeanType();
            if (!type.getPackageName().startsWith("lat.occlus")) continue; // actuator, springdoc…
            checked++;
            boolean exempt = type.isAnnotationPresent(SkipEntitlements.class);
            boolean core = CORE.contains(type);
            boolean module = EntitlementInterceptor.requiredModule(method) != null;
            int decisions = (exempt ? 1 : 0) + (core ? 1 : 0) + (module ? 1 : 0);
            String where = type.getSimpleName() + "#" + method.getMethod().getName() + " " + entry.getKey();
            if (decisions == 0) undecided.add(where);
            if (decisions > 1) contradictory.add(where);
        }
        assertThat(checked).as("controladores revisados").isGreaterThan(40);
        assertThat(undecided).as("endpoints sin @RequiresModule, @SkipEntitlements ni lista de núcleo").isEmpty();
        assertThat(contradictory).as("endpoints con más de una decisión").isEmpty();
    }

    @Test
    void dependenciesBetweenModulesAreConsistent() {
        for (AppModule m : AppModule.values()) {
            assertThat(m.requires()).doesNotContain(m);
            m.requires().forEach(needed -> assertThat(needed.requires()).as("sin ciclos con " + m).doesNotContain(m));
        }
        assertThat(AppModule.dependencyProblems(Set.of(AppModule.BILLING_RIPS))).hasSize(2);
        assertThat(AppModule.dependencyProblems(Set.of(AppModule.BILLING_RIPS, AppModule.CLINICAL_RECORD,
                AppModule.TREATMENTS_CASH))).isEmpty();
    }
}
