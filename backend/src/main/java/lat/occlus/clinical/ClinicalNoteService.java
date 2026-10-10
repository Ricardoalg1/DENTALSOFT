package lat.occlus.clinical;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import lat.occlus.appointment.AppointmentRepository;
import lat.occlus.appointment.AppointmentStatus;
import lat.occlus.clinical.ClinicalDtos.AddendumRequest;
import lat.occlus.clinical.ClinicalDtos.AddendumResponse;
import lat.occlus.clinical.ClinicalDtos.Diagnosis;
import lat.occlus.clinical.ClinicalDtos.NoteRequest;
import lat.occlus.clinical.ClinicalDtos.NoteResponse;
import lat.occlus.clinical.ClinicalDtos.NoteStatus;
import lat.occlus.clinical.ClinicalDtos.NoteSummary;
import lat.occlus.clinical.ClinicalDtos.Ref;
import lat.occlus.patient.Patient;
import lat.occlus.patient.PatientRepository;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.ConflictException;
import lat.occlus.shared.web.ForbiddenException;
import lat.occlus.shared.web.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ClinicalNoteService {

    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");
    /** Margen para diferencias de reloj entre el navegador y el servidor. */
    private static final Duration CLOCK_SKEW = Duration.ofMinutes(5);

    private final org.springframework.jdbc.core.JdbcTemplate jdbc;
    private final ClinicalNoteRepository notes;
    private final ClinicalNoteAddendumRepository addenda;
    private final AppointmentRepository appointments;
    private final PatientRepository patients;
    private final ClinicalAccess access;
    private final Icd10Service icd10;

    @Transactional(readOnly = true)
    public List<NoteResponse> byPatient(UUID clinicId, UUID patientId) {
        access.requirePatient(clinicId, patientId);
        return toResponses(notes.findByClinicIdAndPatientIdOrderByAttendedAtDesc(clinicId, patientId, Limit.of(200)));
    }

    @Transactional(readOnly = true)
    public NoteResponse get(UUID clinicId, UUID id) {
        return toResponses(List.of(find(clinicId, id))).getFirst();
    }

    /** Mis borradores sin firmar (pendientes) o las últimas evoluciones firmadas de la clínica. */
    @Transactional(readOnly = true)
    public List<NoteSummary> list(AuthUser me, boolean myDrafts) {
        var list = myDrafts
                ? notes.findByClinicIdAndDentistIdAndSignedAtIsNullOrderByAttendedAtDesc(me.clinicId(), me.userId())
                : notes.findByClinicIdAndSignedAtIsNotNullOrderBySignedAtDesc(me.clinicId(), Limit.of(50));
        return summaries(list);
    }

    private List<NoteSummary> summaries(List<ClinicalNote> list) {
        Map<UUID, Patient> patientById = patients.findAllById(ids(list, ClinicalNote::getPatientId)).stream()
                .collect(Collectors.toMap(Patient::getId, Function.identity()));
        Map<UUID, Ref> userById = access.userRefs(ids(list, ClinicalNote::getDentistId));
        Map<String, Diagnosis> dx = icd10.byCode(list.stream().map(ClinicalNote::getDiagnosisMain).toList());
        return list.stream().map(n -> {
            var p = patientById.get(n.getPatientId());
            return new NoteSummary(n.getId(), new Ref(p.getId(), p.fullName()), userById.get(n.getDentistId()),
                    n.getAttendedAt().atZone(BOGOTA).toOffsetDateTime(), status(n), n.getReason(),
                    dx.get(n.getDiagnosisMain()), n.getSignedAt());
        }).toList();
    }

    @Transactional(readOnly = true)
    public lat.occlus.shared.web.PageResponse<NoteSummary> search(AuthUser me, String query, boolean drafts, int page, int size) {
        if (page < 0 || page > 1000000 || size < 1 || size > 100 || query.length() > 160)
            throw new BadRequestException("Filtros de búsqueda inválidos");
        String term = "%" + query.trim().replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
        String filter = " from clinical_note n join patient p on p.id=n.patient_id and p.clinic_id=n.clinic_id join app_user u on u.id=n.dentist_id and u.clinic_id=n.clinic_id where n.clinic_id=? and "
                + (drafts ? "n.signed_at is null and n.dentist_id=?" : "n.signed_at is not null")
                + " and (concat_ws(' ',p.first_name,p.middle_name,p.first_last_name,p.second_last_name,p.document_number,u.full_name,n.reason,n.diagnosis_main) ilike ? escape '!')";
        var args = new ArrayList<Object>(); args.add(me.clinicId()); if (drafts) args.add(me.userId()); args.add(term);
        long count = jdbc.queryForObject("select count(*)" + filter, Long.class, args.toArray());
        int pages = (int) Math.ceil((double) count / size);
        int actual = pages == 0 ? 0 : Math.min(page, pages - 1);
        args.add(size); args.add(actual * size);
        var ids = jdbc.queryForList("select n.id" + filter + " order by n.attended_at desc,n.id limit ? offset ?", UUID.class, args.toArray());
        var found = notes.findAllById(ids).stream().collect(Collectors.toMap(ClinicalNote::getId, Function.identity()));
        return new lat.occlus.shared.web.PageResponse<>(summaries(ids.stream().map(found::get).filter(Objects::nonNull).toList()), actual, size, count, pages);
    }

    @Transactional(readOnly = true)
    public lat.occlus.shared.web.PageResponse<NoteResponse> patientPage(UUID clinic, UUID patient, int page, int size) {
        access.requirePatient(clinic, patient);
        if (page < 0 || page > 1000000 || size < 1 || size > 100) throw new BadRequestException("Página inválida");
        var result = notes.findByClinicIdAndPatientId(clinic, patient, org.springframework.data.domain.PageRequest.of(page, size, org.springframework.data.domain.Sort.by(org.springframework.data.domain.Sort.Order.desc("attendedAt"), org.springframework.data.domain.Sort.Order.desc("id"))));
        return new lat.occlus.shared.web.PageResponse<>(toResponses(result.getContent()), result.getNumber(), size, result.getTotalElements(), result.getTotalPages());
    }

    @Transactional(readOnly = true)
    public List<NoteResponse> signedForExport(UUID clinic, UUID patient) {
        access.requirePatient(clinic, patient);
        var list = notes.findByClinicIdAndPatientIdAndSignedAtIsNotNullOrderByAttendedAtAsc(clinic, patient, Limit.of(2001));
        if (list.size() > 2000) throw new BadRequestException("La historia excede el límite de 2000 evoluciones por exportación");
        var result = toResponses(list);
        if (result.stream().anyMatch(n -> !Boolean.TRUE.equals(n.integrityOk()))) throw new ConflictException("Una evolución no supera la comprobación de integridad");
        return result;
    }

    @Transactional
    public NoteResponse create(AuthUser me, UUID patientId, NoteRequest req) {
        access.requireProfessional(me);
        var patient = access.requirePatient(me.clinicId(), patientId);
        var note = new ClinicalNote();
        note.setClinicId(me.clinicId());
        note.setPatientId(patient.getId());
        note.setDentistId(me.userId());

        Instant defaultAttendedAt = Instant.now();
        if (req.appointmentId() != null) {
            var appointment = appointments.findByIdAndClinicId(req.appointmentId(), me.clinicId())
                    .filter(a -> a.getPatientId().equals(patientId))
                    .orElseThrow(() -> new BadRequestException("Cita no válida para este paciente"));
            if (appointment.getStatus() == AppointmentStatus.CANCELLED || appointment.getStatus() == AppointmentStatus.NO_SHOW) {
                throw new BadRequestException("No se puede registrar una evolución para una cita cancelada o sin asistencia");
            }
            if (notes.existsByAppointmentId(appointment.getId())) {
                throw new ConflictException("Esa cita ya tiene una evolución");
            }
            note.setAppointmentId(appointment.getId());
            defaultAttendedAt = appointment.getStartsAt();
        }
        apply(note, req, defaultAttendedAt);
        return toResponses(List.of(notes.saveAndFlush(note))).getFirst();
    }

    /** Editar un borrador. Solo su autor; las firmadas no se tocan (se usan notas aclaratorias). */
    @Transactional
    public NoteResponse update(AuthUser me, UUID id, NoteRequest req) {
        var note = findDraftOwnedBy(me, id);
        apply(note, req, note.getAttendedAt());
        return toResponses(List.of(notes.saveAndFlush(note))).getFirst();
    }

    @Transactional
    public void deleteDraft(AuthUser me, UUID id) {
        notes.delete(findDraftOwnedBy(me, id));
    }

    /**
     * Firma: a partir de aquí la evolución es inmutable. Si viene de una cita abierta que ya empezó,
     * la cita queda como atendida.
     */
    @Transactional
    public NoteResponse sign(AuthUser me, UUID id) {
        var note = findDraftOwnedBy(me, id);
        if (note.getReason() == null) throw new BadRequestException("Para firmar escribe el motivo de consulta");
        if (note.getDiagnosisMain() == null || note.getDiagnosisType() == null) {
            throw new BadRequestException("Para firmar indica el diagnóstico principal y su tipo");
        }
        // Postgres guarda microsegundos: truncar para que el hash se pueda recalcular igual al leer.
        note.setSignedAt(Instant.now().truncatedTo(ChronoUnit.MICROS));
        note.setContentHash(note.computeHash());
        notes.saveAndFlush(note);

        if (note.getAppointmentId() != null) {
            appointments.findByIdAndClinicId(note.getAppointmentId(), me.clinicId())
                    .filter(a -> a.getStatus().isOpen() && !a.getStartsAt().isAfter(Instant.now()))
                    .ifPresent(a -> a.setStatus(AppointmentStatus.ATTENDED));
        }
        return toResponses(List.of(note)).getFirst();
    }

    /** Nota aclaratoria: cualquier profesional puede agregarla a una evolución firmada. */
    @Transactional
    public NoteResponse addAddendum(AuthUser me, UUID id, AddendumRequest req) {
        access.requireProfessional(me);
        var note = find(me.clinicId(), id);
        if (!note.isSigned()) throw new ConflictException("La evolución es un borrador: edítala directamente");
        var addendum = new ClinicalNoteAddendum();
        addendum.setClinicId(me.clinicId());
        addendum.setNoteId(note.getId());
        addendum.setAuthorId(me.userId());
        addendum.setText(req.text().trim());
        addenda.saveAndFlush(addendum);
        return toResponses(List.of(note)).getFirst();
    }

    private void apply(ClinicalNote note, NoteRequest req, Instant defaultAttendedAt) {
        Instant attendedAt = req.attendedAt() == null ? defaultAttendedAt : req.attendedAt().toInstant();
        if (attendedAt.isAfter(Instant.now().plus(CLOCK_SKEW))) {
            throw new BadRequestException("La fecha de atención no puede ser futura");
        }
        String main = icd10.validCode(req.diagnosisMain());
        List<String> related = new ArrayList<>();
        for (String code : req.diagnosisRelated() == null ? List.<String>of() : req.diagnosisRelated()) {
            String valid = icd10.validCode(code);
            if (valid != null && !valid.equals(main) && !related.contains(valid)) related.add(valid);
        }
        if (main == null && !related.isEmpty()) {
            throw new BadRequestException("Indica primero el diagnóstico principal");
        }
        note.setAttendedAt(attendedAt.truncatedTo(ChronoUnit.MICROS));
        note.setReason(clean(req.reason()));
        note.setCurrentIllness(clean(req.currentIllness()));
        note.setExamination(clean(req.examination()));
        note.setDiagnosisMain(main);
        note.setDiagnosisType(main == null ? null : req.diagnosisType());
        note.setDiagnosisRelated1(related.size() > 0 ? related.get(0) : null);
        note.setDiagnosisRelated2(related.size() > 1 ? related.get(1) : null);
        note.setDiagnosisRelated3(related.size() > 2 ? related.get(2) : null);
        note.setProcedures(clean(req.procedures()));
        note.setPlan(clean(req.plan()));
    }

    private ClinicalNote find(UUID clinicId, UUID id) {
        return notes.findByIdAndClinicId(id, clinicId)
                .orElseThrow(() -> new NotFoundException("Evolución no encontrada"));
    }

    private ClinicalNote findDraftOwnedBy(AuthUser me, UUID id) {
        access.requireProfessional(me);
        var note = find(me.clinicId(), id);
        if (note.isSigned()) throw new ConflictException("La evolución está firmada y no se puede modificar");
        if (!note.getDentistId().equals(me.userId())) {
            throw new ForbiddenException("Solo el profesional que la escribió puede editar o firmar esta evolución");
        }
        return note;
    }

    /** Arma las respuestas cargando pacientes, usuarios, diagnósticos y notas aclaratorias en lote. */
    private List<NoteResponse> toResponses(List<ClinicalNote> list) {
        if (list.isEmpty()) return List.of();
        Map<UUID, Patient> patientById = patients.findAllById(ids(list, ClinicalNote::getPatientId)).stream()
                .collect(Collectors.toMap(Patient::getId, Function.identity()));
        Map<UUID, List<ClinicalNoteAddendum>> addendaByNote = addenda.findByNoteIdInOrderByCreatedAt(
                        ids(list, ClinicalNote::getId)).stream()
                .collect(Collectors.groupingBy(ClinicalNoteAddendum::getNoteId));
        Map<UUID, Ref> userById = access.userRefs(Stream.concat(
                list.stream().map(ClinicalNote::getDentistId),
                addendaByNote.values().stream().flatMap(List::stream).map(ClinicalNoteAddendum::getAuthorId)).toList());
        Map<String, Diagnosis> dx = icd10.byCode(list.stream()
                .flatMap(n -> Stream.of(n.getDiagnosisMain(), n.getDiagnosisRelated1(),
                        n.getDiagnosisRelated2(), n.getDiagnosisRelated3()))
                .toList());

        return list.stream().map(n -> {
            var p = patientById.get(n.getPatientId());
            var related = Stream.of(n.getDiagnosisRelated1(), n.getDiagnosisRelated2(), n.getDiagnosisRelated3())
                    .filter(Objects::nonNull).map(dx::get).toList();
            var notesAddenda = addendaByNote.getOrDefault(n.getId(), List.of()).stream()
                    .map(a -> new AddendumResponse(a.getId(), userById.get(a.getAuthorId()), a.getText(), a.getCreatedAt()))
                    .toList();
            return new NoteResponse(n.getId(), new Ref(p.getId(), p.fullName()), userById.get(n.getDentistId()),
                    n.getAppointmentId(), n.getAttendedAt().atZone(BOGOTA).toOffsetDateTime(), status(n),
                    n.getReason(), n.getCurrentIllness(), n.getExamination(),
                    dx.get(n.getDiagnosisMain()), n.getDiagnosisType(), related,
                    n.getProcedures(), n.getPlan(), n.getSignedAt(), n.getContentHash(),
                    n.isSigned() ? n.computeHash().equals(n.getContentHash()) : null,
                    notesAddenda, n.getCreatedAt(), n.getUpdatedAt());
        }).toList();
    }

    private static NoteStatus status(ClinicalNote n) {
        return n.isSigned() ? NoteStatus.SIGNED : NoteStatus.DRAFT;
    }

    private static Collection<UUID> ids(List<ClinicalNote> list, Function<ClinicalNote, UUID> getter) {
        return list.stream().map(getter).collect(Collectors.toSet());
    }

    private static String clean(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
