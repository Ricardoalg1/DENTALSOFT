package lat.occlus.clinical;
import java.util.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Service @RequiredArgsConstructor
public class PrescriptionService {
 private final JdbcTemplate jdbc; private final ObjectMapper mapper; private final ClinicalAccess access;
 private final DocumentBrandingService branding; private final BrandedPdfRenderer renderer;
 public record Medicine(@NotBlank @Size(max=200) String name,@NotBlank @Size(max=120) String concentration,
  @NotBlank @Size(max=120) String presentation,@NotBlank @Size(max=160) String dose,@NotBlank @Size(max=100) String route,
  @NotBlank @Size(max=120) String frequency,@NotBlank @Size(max=120) String duration,@NotBlank @Size(max=120) String quantity,
  @NotNull @Size(max=1000) String instructions) {}
 public record Request(@NotNull UUID operationId,@NotNull @Size(max=30) List<@NotNull @Valid Medicine> medicines,
  @NotNull @Size(max=10000) String recommendations,@NotNull @Size(max=1000) String diagnosis) {}
 public record Content(List<Medicine> medicines,String recommendations,String diagnosis) {}
 public record Snapshot(DocumentBrandingService.Branding clinic,String patient,String identification,LocalDate birthDate,
  String professional,String registration,UUID signatureId) {}
 public record Response(UUID id,UUID patientId,UUID authorId,String author,Content content,Snapshot snapshot,Instant signedAt,String hash,Instant createdAt,boolean integrityOk) {}
 private record Row(UUID id,UUID clinic,UUID patient,UUID author,String authorName,String content,String snapshot,Instant signed,String hash,Instant created) {}
 @Transactional public Response create(AuthUser me,UUID patient,Request req) {
  access.requireProfessional(me); access.requirePatient(me.clinicId(),patient); validate(req);
  var existing=jdbc.query("select id from clinical_prescription where clinic_id=? and author_id=? and operation_id=?",(r,n)->r.getObject(1,UUID.class),me.clinicId(),me.userId(),req.operationId());
  if(!existing.isEmpty()) {var old=find(me,existing.getFirst()); if(!old.patient.equals(patient)||!old.content.equals(json(new Content(req.medicines(),req.recommendations().trim(),req.diagnosis().trim()))))throw new ConflictException("Este intento ya creó una fórmula diferente");return response(old);}
  var id=UUID.randomUUID();jdbc.update("insert into clinical_prescription(id,clinic_id,patient_id,author_id,operation_id,content) values(?,?,?,?,?,?) on conflict(clinic_id,author_id,operation_id) do nothing",id,me.clinicId(),patient,me.userId(),req.operationId(),json(new Content(req.medicines(),req.recommendations().trim(),req.diagnosis().trim())));
  var ids=jdbc.query("select id from clinical_prescription where clinic_id=? and author_id=? and operation_id=?",(r,n)->r.getObject(1,UUID.class),me.clinicId(),me.userId(),req.operationId());
  var row=find(me,ids.getFirst()); if(!row.patient.equals(patient)||!row.content.equals(json(new Content(req.medicines(),req.recommendations().trim(),req.diagnosis().trim()))))throw new ConflictException("El intento ya fue usado");
  if(row.id.equals(id)) event(me,id,"CREATED"); return response(row);
 }
 @Transactional public Response update(AuthUser me,UUID id,Request req) {
  access.requireProfessional(me);validate(req);var row=findLocked(me,id);owned(me,row);
  jdbc.update("update clinical_prescription set content=?,updated_at=now() where id=? and clinic_id=?",json(new Content(req.medicines(),req.recommendations().trim(),req.diagnosis().trim())),id,me.clinicId()); event(me,id,"UPDATED");return response(find(me,id));
 }
 @Transactional public Response sign(AuthUser me,UUID id,boolean confirmed) {
  access.requireProfessional(me);if(!confirmed)throw new BadRequestException("Confirma la revisión de la fórmula antes de firmar");
  var row=findLocked(me,id);if(row.signed!=null){if(!row.author.equals(me.userId()))throw new ForbiddenException("Solo el autor puede firmar");return response(row);}owned(me,row);
  var p=access.requirePatient(me.clinicId(),row.patient);var profile=branding.profile(me);
  if(profile.registration().isBlank())throw new BadRequestException("Configura tu registro profesional en Mi cuenta antes de firmar fórmulas");
  if(profile.signatureId()==null)throw new BadRequestException("Configura tu firma en Mi cuenta antes de firmar fórmulas");
  var snapshot=json(new Snapshot(branding.branding(me.clinicId()),p.fullName(),p.getDocumentType()+" "+p.getDocumentNumber(),p.getBirthDate(),profile.name(),profile.registration(),profile.signatureId()));
  var signed=Instant.now().truncatedTo(ChronoUnit.MICROS);var hash=hash(row,snapshot,signed);
  jdbc.update("update clinical_prescription set snapshot=?,signed_at=?,content_hash=?,updated_at=now() where id=? and clinic_id=?",snapshot,java.sql.Timestamp.from(signed),hash,id,me.clinicId()); event(me,id,"SIGNED");pdf(me,id);return response(find(me,id));
 }
 @Transactional(readOnly=true) public Response get(AuthUser me,UUID id) {return response(find(me,id));}
 @Transactional(readOnly=true) public PageResponse<Response> list(AuthUser me,UUID patient,int page) {
  access.requirePatient(me.clinicId(),patient);if(page<0||page>1000000)throw new BadRequestException("Página inválida");
  var filter=" where p.clinic_id=? and p.patient_id=? and (p.signed_at is not null or p.author_id=?)";
  long count=jdbc.queryForObject("select count(*) from clinical_prescription p"+filter,Long.class,me.clinicId(),patient,me.userId());int pages=(int)Math.ceil(count/10.0),actual=pages==0?0:Math.min(page,pages-1);
  var rows=jdbc.query(select()+filter+" order by p.created_at desc,p.id limit 10 offset ?",this::map,me.clinicId(),patient,me.userId(),actual*10);
  return new PageResponse<>(rows.stream().map(this::response).toList(),actual,10,count,pages);
 }
 @Transactional public byte[] pdf(AuthUser me,UUID id) {
  var row=find(me,id);var data=response(row);if(row.signed==null)throw new ConflictException("Firma la fórmula antes de exportarla");if(!data.integrityOk)throw new ConflictException("La fórmula no supera la comprobación de integridad");
  var s=data.snapshot;var lines=new ArrayList<String>();lines.add("FÓRMULA MÉDICA / INDICACIONES");lines.add("Paciente: "+s.patient);lines.add("Documento: "+s.identification);lines.add("Nacimiento: "+s.birthDate.format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy")));lines.add("Fecha: "+row.signed.atZone(ZoneId.of("America/Bogota")).format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy")));lines.add("Profesional: "+s.professional);lines.add("Registro profesional: "+s.registration);lines.add("Referencia: "+id);lines.add("");
  if(!data.content.diagnosis.isBlank()){lines.add("DIAGNÓSTICO / MOTIVO");lines.add(data.content.diagnosis);lines.add("");}
  int number=0;for(var m:data.content.medicines){lines.add("MEDICAMENTO "+(++number)+" - "+m.name);lines.add("Concentración: "+m.concentration+" | Presentación: "+m.presentation);lines.add("Dosis: "+m.dose+" | Vía: "+m.route);lines.add("Frecuencia: "+m.frequency+" | Duración: "+m.duration);lines.add("Cantidad total: "+m.quantity);if(!m.instructions.isBlank())lines.add("Indicaciones: "+m.instructions);lines.add("");}
  if(!data.content.recommendations.isBlank()){lines.add("RECOMENDACIONES");lines.add(data.content.recommendations);lines.add("");}
  lines.add("FIRMA DEL PROFESIONAL");lines.add(s.professional+" - Registro "+s.registration);lines.add("Firmada: "+row.signed);lines.add("Huella SHA-256: "+row.hash);
  var bytes=renderer.render(me.clinicId(),s.clinic,lines,Map.of("FIRMA DEL PROFESIONAL",s.signatureId));event(me,id,"PDF");return bytes;
 }
 private Row find(AuthUser me,UUID id){var rows=jdbc.query(select()+" where p.id=? and p.clinic_id=? and (p.signed_at is not null or p.author_id=?)",this::map,id,me.clinicId(),me.userId());if(rows.isEmpty())throw new NotFoundException("Fórmula no encontrada");return rows.getFirst();}
 private Row findLocked(AuthUser me,UUID id){var rows=jdbc.query(select()+" where p.id=? and p.clinic_id=? and (p.signed_at is not null or p.author_id=?) for update of p",this::map,id,me.clinicId(),me.userId());if(rows.isEmpty())throw new NotFoundException("Fórmula no encontrada");return rows.getFirst();}
 private String select(){return "select p.*,u.full_name from clinical_prescription p join app_user u on u.id=p.author_id and u.clinic_id=p.clinic_id";}
 private Row map(java.sql.ResultSet r,int n)throws java.sql.SQLException{return new Row(r.getObject("id",UUID.class),r.getObject("clinic_id",UUID.class),r.getObject("patient_id",UUID.class),r.getObject("author_id",UUID.class),r.getString("full_name"),r.getString("content"),r.getString("snapshot"),r.getTimestamp("signed_at")==null?null:r.getTimestamp("signed_at").toInstant(),r.getString("content_hash"),r.getTimestamp("created_at").toInstant());}
 private Response response(Row r){return new Response(r.id,r.patient,r.author,r.authorName,mapper.readValue(r.content,Content.class),r.snapshot==null?null:mapper.readValue(r.snapshot,Snapshot.class),r.signed,r.hash,r.created,r.signed==null||Objects.equals(r.hash,hash(r,r.snapshot,r.signed)));}
 private String json(Object o){return mapper.writeValueAsString(o);}
 private String hash(Row r,String snapshot,Instant signed){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json(List.of(r.id,r.clinic,r.patient,r.author,r.content,snapshot,signed.toString())).getBytes(StandardCharsets.UTF_8)));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
 private void validate(Request r){if(r.medicines.isEmpty()&&r.recommendations.isBlank())throw new BadRequestException("Añade un medicamento o recomendaciones");}
 private void owned(AuthUser me,Row r){if(!r.author.equals(me.userId()))throw new ForbiddenException("Solo el autor puede modificar su fórmula");if(r.signed!=null)throw new ConflictException("La fórmula firmada no se puede modificar");}
 private void event(AuthUser me,UUID id,String kind){jdbc.update("insert into clinical_prescription_event(id,clinic_id,prescription_id,actor_id,kind) values(?,?,?,?,?)",UUID.randomUUID(),me.clinicId(),id,me.userId(),kind);}
}
