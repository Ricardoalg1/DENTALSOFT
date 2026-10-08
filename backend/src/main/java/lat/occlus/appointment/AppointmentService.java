package lat.occlus.appointment;

import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lat.occlus.appointment.AgendaDtos.AppointmentRequest;
import lat.occlus.appointment.AgendaDtos.AppointmentResponse;
import lat.occlus.appointment.AgendaDtos.PatientRef;
import lat.occlus.appointment.AgendaDtos.Ref;
import lat.occlus.appointment.AgendaDtos.StatusRequest;
import lat.occlus.patient.Patient;
import lat.occlus.patient.PatientRepository;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.ConflictException;
import lat.occlus.shared.web.NotFoundException;
import lat.occlus.site.Site;
import lat.occlus.site.SiteRepository;
import lat.occlus.user.AppUser;
import lat.occlus.user.AppUserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Limit;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AppointmentService {

    static final ZoneId BOGOTA = ZoneId.of("America/Bogota");
    private static final Duration MAX_RANGE = Duration.ofDays(62);
    private static final UUID NO_ID = new UUID(0, 0);

    private final AppointmentRepository appointments;
    private final PatientRepository patients;
    private final AppUserRepository users;
    private final SiteRepository sites;
    private final ScheduleService scheduleService;

    /** Citas que se cruzan con [from, to), opcionalmente de un profesional y/o sede. */
    @Transactional(readOnly = true)
    public List<AppointmentResponse> list(UUID clinicId, OffsetDateTime from, OffsetDateTime to,
                                          UUID dentistId, UUID siteId, boolean includeCancelled) {
        if (!to.isAfter(from)) throw new BadRequestException("Rango de fechas inválido");
        if (Duration.between(from, to).compareTo(MAX_RANGE) > 0) {
            throw new BadRequestException("El rango máximo es de 62 días");
        }
        Specification<Appointment> spec = (root, q, cb) -> cb.and(
                cb.equal(root.get("clinicId"), clinicId),
                cb.lessThan(root.get("startsAt"), to.toInstant()),
                cb.greaterThan(root.get("endsAt"), from.toInstant()));
        if (dentistId != null) spec = spec.and((root, q, cb) -> cb.equal(root.get("dentistId"), dentistId));
        if (siteId != null) spec = spec.and((root, q, cb) -> cb.equal(root.get("siteId"), siteId));
        if (!includeCancelled) {
            spec = spec.and((root, q, cb) -> cb.notEqual(root.get("status"), AppointmentStatus.CANCELLED));
        }
        return toResponses(appointments.findAll(spec, Sort.by("startsAt")));
    }

    @Transactional(readOnly = true)
    public List<AppointmentResponse> byPatient(UUID clinicId, UUID patientId) {
        return toResponses(appointments.findByClinicIdAndPatientIdOrderByStartsAtDesc(clinicId, patientId, Limit.of(50)));
    }

    @Transactional(readOnly = true)
    public AppointmentResponse get(UUID clinicId, UUID id) {
        return toResponses(List.of(find(clinicId, id))).getFirst();
    }

    @Transactional
    public AppointmentResponse create(UUID clinicId, UUID userId, AppointmentRequest req) {
        var appointment = new Appointment();
        appointment.setClinicId(clinicId);
        appointment.setCreatedBy(userId);
        apply(clinicId, appointment, req);
        return toResponses(List.of(appointments.saveAndFlush(appointment))).getFirst();
    }

    /** Editar o reprogramar. Solo citas programadas o confirmadas. */
    @Transactional
    public AppointmentResponse update(UUID clinicId, UUID id, AppointmentRequest req) {
        var appointment = findForWrite(clinicId, id);
        if (!appointment.getStatus().isOpen()) {
            throw new ConflictException("Solo se pueden modificar citas programadas o confirmadas");
        }
        apply(clinicId, appointment, req);
        return toResponses(List.of(appointments.saveAndFlush(appointment))).getFirst();
    }

    @Transactional
    public AppointmentResponse changeStatus(UUID clinicId, UUID id, StatusRequest req) {
        var appointment = findForWrite(clinicId, id);
        var next = req.status();
        if (!appointment.getStatus().canMoveTo(next)) {
            throw new ConflictException("No se puede pasar la cita de %s a %s".formatted(appointment.getStatus(), next));
        }
        if ((next == AppointmentStatus.ATTENDED || next == AppointmentStatus.NO_SHOW)
                && appointment.getStartsAt().isAfter(Instant.now())) {
            throw new BadRequestException("No se puede marcar como atendida o inasistencia una cita futura");
        }
        appointment.setStatus(next);
        appointment.setCancellationReason(next == AppointmentStatus.CANCELLED ? clean(req.cancellationReason()) : null);
        return toResponses(List.of(appointments.saveAndFlush(appointment))).getFirst();
    }

    private void apply(UUID clinicId, Appointment a, AppointmentRequest req) {
        var patient = patients.findByIdAndClinicId(req.patientId(), clinicId)
                .orElseThrow(() -> new BadRequestException("Paciente no válido"));
        if (!patient.isActive()) throw new BadRequestException("El paciente está inactivo");
        var dentist = users.findByIdAndClinicId(req.dentistId(), clinicId)
                .filter(u -> u.isActive() && u.isProfessional())
                .orElseThrow(() -> new BadRequestException("Profesional no válido"));
        var site = sites.findById(req.siteId())
                .filter(s -> s.getClinicId().equals(clinicId) && s.isActive())
                .orElseThrow(() -> new BadRequestException("Sede no válida"));

        var start = req.startsAt().atZoneSameInstant(BOGOTA);
        var end = start.plusMinutes(req.durationMinutes());
        scheduleService.ensureWithinSchedule(clinicId, dentist.getId(), site.getId(), start, end);

        // Chequeo previo para dar un mensaje claro; la restricción de exclusión de la BD cubre las carreras.
        UUID excludeId = a.getId() == null ? NO_ID : a.getId();
        if (appointments.existsOverlap(dentist.getId(), start.toInstant(), end.toInstant(), excludeId,
                AppointmentStatus.CANCELLED)) {
            throw new ConflictException("El profesional ya tiene una cita en ese horario");
        }

        a.setPatientId(patient.getId());
        a.setDentistId(dentist.getId());
        a.setSiteId(site.getId());
        a.setStartsAt(start.toInstant());
        a.setEndsAt(end.toInstant());
        a.setReason(clean(req.reason()));
        a.setNotes(clean(req.notes()));
    }

    private Appointment find(UUID clinicId, UUID id) {
        return appointments.findByIdAndClinicId(id, clinicId)
                .orElseThrow(() -> new NotFoundException("Cita no encontrada"));
    }

    private Appointment findForWrite(UUID clinicId, UUID id) {
        return appointments.findForWrite(id, clinicId)
                .orElseThrow(() -> new NotFoundException("Cita no encontrada"));
    }

    /** Carga pacientes, profesionales y sedes en lote (3 consultas) en vez de una por cita. */
    private List<AppointmentResponse> toResponses(List<Appointment> list) {
        Map<UUID, Patient> patientById = byId(patients.findAllById(ids(list, Appointment::getPatientId)), Patient::getId);
        Map<UUID, AppUser> dentistById = byId(users.findAllById(ids(list, Appointment::getDentistId)), AppUser::getId);
        Map<UUID, Site> siteById = byId(sites.findAllById(ids(list, Appointment::getSiteId)), Site::getId);
        return list.stream().map(a -> {
            var p = patientById.get(a.getPatientId());
            var d = dentistById.get(a.getDentistId());
            var s = siteById.get(a.getSiteId());
            return new AppointmentResponse(a.getId(),
                    a.getStartsAt().atZone(BOGOTA).toOffsetDateTime(),
                    a.getEndsAt().atZone(BOGOTA).toOffsetDateTime(),
                    a.getStatus(), a.getReason(), a.getNotes(), a.getCancellationReason(),
                    new PatientRef(p.getId(), p.fullName(), p.getDocumentType(), p.getDocumentNumber(), p.getPhone()),
                    new Ref(d.getId(), d.getFullName()),
                    new Ref(s.getId(), s.getName()));
        }).toList();
    }

    private static <T> Collection<UUID> ids(List<Appointment> list, Function<Appointment, UUID> getter) {
        return list.stream().map(getter).collect(Collectors.toSet());
    }

    private static <T> Map<UUID, T> byId(List<T> items, Function<T, UUID> id) {
        return items.stream().collect(Collectors.toMap(id, Function.identity()));
    }

    private static String clean(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
