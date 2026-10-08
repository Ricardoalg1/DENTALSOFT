package lat.occlus.billing;

import static lat.occlus.billing.BillingDtos.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import lat.occlus.clinical.ClinicalNoteRepository;
import lat.occlus.shared.access.StaffAccess;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.BadRequestException;
import lat.occlus.shared.web.ConflictException;
import lat.occlus.shared.web.NotFoundException;
import lat.occlus.treatment.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Limit;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Service @RequiredArgsConstructor
public class BillingService {
    private final BillingProfileRepository profiles;
    private final BillingInvoiceRepository invoices;
    private final InvoiceReservationRepository reservations;
    private final TreatmentPlanRepository plans;
    private final TreatmentItemRepository items;
    private final ClinicalNoteRepository notes;
    private final StaffAccess access;
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final RipsDraftService rips;

    @Transactional(readOnly=true)
    public Issuer profile(UUID clinicId) {
        return profiles.findById(clinicId).map(BillingProfile::issuer).orElse(null);
    }

    @Transactional
    public Issuer saveProfile(AuthUser me, Issuer req) {
        var p=profiles.findById(me.clinicId()).orElseGet(BillingProfile::new);
        p.setClinicId(me.clinicId()); p.setLegalName(req.legalName().trim()); p.setNit(req.nit());
        p.setProviderCode(req.providerCode()); p.setAddress(req.address().trim());
        p.setMunicipality(req.municipality()); p.setEmail(req.email().trim());
        p.setUpdatedBy(me.userId()); p.setUpdatedAt(Instant.now());
        return profiles.saveAndFlush(p).issuer();
    }

    @Transactional(readOnly=true)
    public List<Summary> list(UUID clinicId) {
        return invoices.findByClinicIdOrderByCreatedAtDesc(clinicId,Limit.of(100)).stream().map(b ->
                new Summary(b.getId(),b.getDraftNumber(),b.getPatientId(),snapshot(b).patientName(),
                        b.getStatus(),b.getTotal(),b.getCreatedAt())).toList();
    }

    @Transactional(readOnly=true)
    public InvoiceResponse get(UUID clinicId, UUID id) { return response(find(clinicId,id,false)); }

    @Transactional(readOnly=true)
    public List<UUID> eligibleItems(UUID clinicId, UUID planId) {
        var plan=plans.findByIdAndClinicId(planId,clinicId).orElseThrow(() -> new NotFoundException("Plan no encontrado"));
        var reserved=new HashSet<>(reservations.reservedItems(clinicId,plan.getPatientId()));
        return items.findByPlanIdOrderBySortOrderAscCreatedAtAsc(planId).stream()
                .filter(i -> i.getStatus()==ItemStatus.DONE && !reserved.contains(i.getId()))
                .map(TreatmentItem::getId).toList();
    }

    @Transactional
    public InvoiceResponse create(AuthUser me, CreateRequest req) {
        var plan=plans.findLocked(me.clinicId(),req.planId()).orElseThrow(() -> new NotFoundException("Plan no encontrado"));
        if (!Set.of(PlanStatus.ACCEPTED,PlanStatus.COMPLETED,PlanStatus.CANCELLED).contains(plan.getStatus()))
            throw new ConflictException("Solo se facturan procedimientos de planes aceptados");
        var patient=access.requirePatient(me.clinicId(),plan.getPatientId());
        var selected=new HashSet<>(req.itemIds());
        if (selected.size()!=req.itemIds().size()) throw new BadRequestException("No repitas procedimientos");
        var source=items.findByPlanIdOrderBySortOrderAscCreatedAtAsc(plan.getId()).stream()
                .filter(i -> selected.contains(i.getId())).toList();
        if (source.size()!=selected.size() || source.stream().anyMatch(i -> i.getStatus()!=ItemStatus.DONE))
            throw new BadRequestException("Selecciona únicamente procedimientos realizados del plan");
        var reserved=new HashSet<>(reservations.reservedItems(me.clinicId(),patient.getId()));
        if (source.stream().anyMatch(i -> reserved.contains(i.getId()))) throw new ConflictException("Un procedimiento ya está reservado en otro documento");
        var lines=source.stream().map(i -> new Line(i.getId(),i.getDescription(),i.getCupsCode(),i.getQuantity(),
                i.getUnitPrice(),i.getDiscount(),i.total(),null,null,null,null,List.of())).toList();
        var buyer=new Buyer(patient.getDocumentType().name(),patient.getDocumentNumber(),patient.fullName(),patient.getEmail(),patient.getAddress());
        String sex=switch(patient.getSex()) { case H -> "M"; case M -> "F"; case I -> "I"; };
        var snap=new Snapshot(profile(me.clinicId()),buyer,patient.fullName(),patient.getDocumentType().name(),
                patient.getDocumentNumber(),patient.getBirthDate(),sex,null,lines);
        Long number=jdbc.queryForObject("""
                insert into clinic_counter(clinic_id,name,value) values (?,'BILL_DRAFT',1)
                on conflict(clinic_id,name) do update set value=clinic_counter.value+1 returning value
                """,Long.class,me.clinicId());
        var b=new BillingInvoice(); b.setClinicId(me.clinicId()); b.setPatientId(patient.getId());
        b.setPlanId(plan.getId()); b.setDraftNumber(Objects.requireNonNull(number));
        b.setSnapshotJson(mapper.writeValueAsString(snap)); b.setCreatedBy(me.userId());
        b.setTotal(lines.stream().map(Line::total).reduce(BigDecimal.ZERO,BigDecimal::add));
        invoices.saveAndFlush(b);
        for(var line:lines) {
            var reservation=new InvoiceReservation(); reservation.setClinicId(me.clinicId());
            reservation.setInvoiceId(b.getId()); reservation.setSourceItemId(line.sourceItemId());
            reservations.save(reservation);
        }
        reservations.flush();
        return response(b);
    }

    @Transactional
    public InvoiceResponse saveUser(AuthUser me, UUID id, RipsUser user) {
        var b=draft(me.clinicId(),id); var s=snapshot(b);
        save(b,new Snapshot(profile(me.clinicId()),s.buyer(),s.patientName(),s.documentType(),s.documentNumber(),s.birthDate(),s.sex(),user,s.lines()));
        return response(b);
    }

    @Transactional(readOnly=true)
    public List<NoteOption> signedNotes(UUID clinicId,UUID id) {
        var b=find(clinicId,id,false);
        return notes.findByClinicIdAndPatientIdOrderByAttendedAtDesc(clinicId,b.getPatientId(),Limit.of(100)).stream()
                .filter(n -> n.isSigned() && n.computeHash().equals(n.getContentHash()))
                .map(n -> new NoteOption(n.getId(),n.getAttendedAt(),n.getDiagnosisMain())).toList();
    }

    @Transactional
    public InvoiceResponse saveService(AuthUser me, UUID id, UUID sourceId, ServiceRips req) {
        var b=draft(me.clinicId(),id); var s=snapshot(b);
        var note=notes.findByIdAndClinicId(req.clinicalNoteId(),me.clinicId())
                .filter(n -> n.getPatientId().equals(b.getPatientId()) && n.isSigned())
                .orElseThrow(() -> new BadRequestException("Vincula una evolución firmada de este paciente"));
        if (!note.computeHash().equals(note.getContentHash())) throw new ConflictException("La evolución no supera la comprobación de integridad");
        if (s.lines().stream().noneMatch(l -> l.sourceItemId().equals(sourceId))) throw new NotFoundException("Ítem no encontrado");
        var related=java.util.stream.Stream.of(note.getDiagnosisRelated1(),note.getDiagnosisRelated2(),note.getDiagnosisRelated3())
                .filter(Objects::nonNull).toList();
        String type=switch(note.getDiagnosisType()) { case IMPRESSION -> "01"; case CONFIRMED_NEW -> "02"; case CONFIRMED_REPEAT -> "03"; };
        var lines=s.lines().stream().map(l -> !l.sourceItemId().equals(sourceId)?l:
                new Line(l.sourceItemId(),l.description(),req.cupsCode(),l.quantity(),l.unitPrice(),l.discount(),l.total(),req,
                        note.getAttendedAt(),note.getDiagnosisMain(),type,related)).toList();
        save(b,new Snapshot(s.issuer(),s.buyer(),s.patientName(),s.documentType(),s.documentNumber(),s.birthDate(),s.sex(),s.user(),lines));
        return response(b);
    }

    @Transactional
    public InvoiceResponse prepare(AuthUser me,UUID id) {
        var b=draft(me.clinicId(),id);
        var validation=rips.validate(snapshot(b));
        if (!validation.dataReady()) throw new BadRequestException(String.join(" ",validation.errors()));
        b.setStatus(Status.PREPARED); b.setPreparedAt(Instant.now()); b.setPreparedBy(me.userId());
        return response(invoices.saveAndFlush(b));
    }

    @Transactional
    public InvoiceResponse cancel(AuthUser me,UUID id,String reason) {
        var b=find(me.clinicId(),id,true);
        if (b.getStatus()==Status.CANCELLED) throw new ConflictException("El borrador ya está cancelado");
        b.setStatus(Status.CANCELLED); b.setCancelReason(reason.trim());
        b.setCancelledAt(Instant.now()); b.setCancelledBy(me.userId());
        reservations.findByInvoiceId(id).forEach(r -> r.setActive(false));
        reservations.flush();
        return response(invoices.saveAndFlush(b));
    }

    @Transactional(readOnly=true)
    public RipsPreview preview(UUID clinicId,UUID id) { return rips.preview(snapshot(find(clinicId,id,false))); }

    private BillingInvoice find(UUID clinicId,UUID id,boolean lock) {
        return (lock?invoices.findLocked(clinicId,id):invoices.findByIdAndClinicId(id,clinicId))
                .orElseThrow(() -> new NotFoundException("Documento no encontrado"));
    }
    private BillingInvoice draft(UUID clinicId,UUID id) {
        var b=find(clinicId,id,true);
        if (b.getStatus()!=Status.DRAFT) throw new ConflictException("Solo se editan documentos en borrador");
        return b;
    }
    private Snapshot snapshot(BillingInvoice b) { return mapper.readValue(b.getSnapshotJson(),Snapshot.class); }
    private void save(BillingInvoice b,Snapshot s) { b.setSnapshotJson(mapper.writeValueAsString(s)); invoices.saveAndFlush(b); }
    private InvoiceResponse response(BillingInvoice b) {
        var s=snapshot(b);
        return new InvoiceResponse(b.getId(),b.getDraftNumber(),b.getPatientId(),b.getPlanId(),b.getStatus(),b.getTotal(),
                b.getCreatedAt(),b.getPreparedAt(),b.getCancelledAt(),b.getCancelReason(),s,rips.validate(s));
    }
}
