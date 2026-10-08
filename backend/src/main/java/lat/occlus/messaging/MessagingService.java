package lat.occlus.messaging;

import static lat.occlus.messaging.MessagingDtos.*;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import lat.occlus.appointment.*;
import lat.occlus.patient.Patient;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service @RequiredArgsConstructor
public class MessagingService {
 private final JdbcTemplate db;
 private final MessagingProperties config;
 private final ReplyClassifier classifier;
 private final AppointmentService appointments;
 private final EntityManager em;
 private final MessageSender simulatedSender=new SimulatedMessageSender();
 private static final ZoneId BOGOTA=ZoneId.of("America/Bogota");
 private static final DateTimeFormatter DATE=DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm").withZone(BOGOTA);

 boolean simulated(UUID clinic) {return !config.whatsapp().configured() || !clinic.equals(config.whatsapp().clinicId());}
 private MessageSender sender(UUID clinic) {return simulated(clinic)?simulatedSender:new WhatsAppCloudSender(config.whatsapp());}
 @Transactional(readOnly=true)
 public Overview overview(UUID clinic) {
  var messages=db.query("""
   select m.*,concat_ws(' ',p.first_name,p.first_last_name) patient_name from message m
   left join patient p on p.id=m.patient_id and p.clinic_id=m.clinic_id
   where m.clinic_id=? order by (m.needs_attention and m.resolved_at is null) desc,m.created_at desc,m.id limit 100
   """,this::view,clinic);
  int count=db.queryForObject("select count(*) from message where clinic_id=? and needs_attention and resolved_at is null",Integer.class,clinic);
  var channel=new Channel(simulated(clinic),config.ai().configured(),config.schedulerEnabled(),simulated(clinic)?
    "Modo simulado: no se envían mensajes ni se llama a la IA externa.":"WhatsApp real habilitado para esta clínica. La aceptación de Meta no garantiza entrega; revisa el estado del mensaje.");
  return new Overview(settings(clinic),channel,messages,count);
 }
 private MessageView view(ResultSet r,int n) throws SQLException {
  return new MessageView(uuid(r,"id"),uuid(r,"patient_id"),r.getString("patient_name"),uuid(r,"appointment_id"),instant(r,"appointment_starts_at"),
   r.getString("direction"),r.getString("kind"),r.getString("phone"),r.getString("body"),r.getString("status"),r.getBoolean("simulated"),r.getString("delivery_status"),
   r.getString("intent"),r.getString("intent_source"),r.getString("intent_summary"),r.getString("action"),r.getBoolean("needs_attention"),instant(r,"resolved_at"),r.getString("resolution_note"),r.getString("error"),instant(r,"created_at"),r.getString("provider_message_id"));
 }
 private static UUID uuid(ResultSet r,String key)throws SQLException{return r.getObject(key,UUID.class);}
 private static Instant instant(ResultSet r,String key)throws SQLException{var t=r.getTimestamp(key);return t==null?null:t.toInstant();}
 private Settings settings(UUID clinic) {
  var list=db.query("select * from messaging_settings where clinic_id=?",(r,n)->new Settings(r.getBoolean("reminders_enabled"),r.getInt("hours_before"),r.getBoolean("ai_enabled")),clinic);
  return list.isEmpty()?new Settings(false,24,false):list.getFirst();
 }
 @Transactional
 public Settings saveSettings(AuthUser me,Settings settings) {
  db.update("""
   insert into messaging_settings(clinic_id,reminders_enabled,hours_before,ai_enabled,updated_by)
   values(?,?,?,?,?) on conflict(clinic_id) do update set reminders_enabled=excluded.reminders_enabled,
   hours_before=excluded.hours_before,ai_enabled=excluded.ai_enabled,updated_by=excluded.updated_by,updated_at=now()
   """,me.clinicId(),settings.remindersEnabled(),settings.hoursBefore(),settings.aiEnabled(),me.userId());
  return settings;
 }
 @Transactional(readOnly=true)
 public List<UUID> enabledClinics() {
  return db.query("select clinic_id from messaging_settings where reminders_enabled",(r,n)->uuid(r,"clinic_id"));
 }
 @Transactional
 public int queueReminders(UUID clinic) {
  var settings=settings(clinic);
  if(!settings.remindersEnabled()) return 0;
  var rows=db.queryForList("""
   select a.id,a.patient_id,a.starts_at,p.phone,p.first_name,s.name site_name,c.name clinic_name
   from appointment a join patient p on p.id=a.patient_id and p.clinic_id=a.clinic_id
   join site s on s.id=a.site_id and s.clinic_id=a.clinic_id join clinic c on c.id=a.clinic_id
   where a.clinic_id=? and a.status in ('SCHEDULED','CONFIRMED') and p.active and p.whatsapp_consent and s.active
   and a.starts_at>now() and a.starts_at<=now()+(? * interval '1 hour')
   and not exists(select 1 from message m where m.appointment_id=a.id and m.appointment_starts_at=a.starts_at and m.kind='REMINDER')
   order by a.starts_at limit 50
   """,clinic,settings.hoursBefore());
  int queued=0;
  for(var a:rows) {
   var phone=Phones.toWhatsApp((String)a.get("phone")); if(phone.isEmpty()) continue;
   Instant starts=((java.sql.Timestamp)a.get("starts_at")).toInstant();
   String body="Hola %s. %s te recuerda tu cita el %s en %s. Responde CONFIRMO, CANCELAR o REPROGRAMAR. Para dejar de recibir mensajes responde BAJA."
    .formatted(a.get("first_name"),a.get("clinic_name"),DATE.format(starts),a.get("site_name"));
   queued+=db.update("""
    insert into message(id,clinic_id,patient_id,appointment_id,direction,kind,phone,body,template,status,appointment_starts_at,simulated)
    values(?,?,?,?,'OUT','REMINDER',?,?,?,'QUEUED',?,?) on conflict do nothing
    """,UUID.randomUUID(),clinic,a.get("patient_id"),a.get("id"),phone.get(),body,config.whatsapp().reminderTemplate(),java.sql.Timestamp.from(starts),simulated(clinic));
  }
  return queued;
 }
 @Transactional
 public UUID claimOutgoing(UUID clinic) {
  db.update("update message set status='FAILED',needs_attention=true,error='Intento interrumpido; revisa Meta antes de reenviar.',processed_at=now() where clinic_id=? and status='SENDING' and attempt_started_at<now()-interval '2 minutes'",clinic);
  var rows=db.queryForList("select * from message where clinic_id=? and direction='OUT' and status='QUEUED' order by created_at limit 1 for update skip locked",clinic);
  if(rows.isEmpty()) return null;
  UUID id=(UUID)rows.getFirst().get("id");
  db.update("update message set status='SENDING',attempt_started_at=now() where id=? and clinic_id=?",id,clinic);
  return id;
 }
 @Transactional
 public void sendClaimed(UUID clinic,UUID messageId) {
  var rows=db.queryForList("select * from message where clinic_id=? and id=? and direction='OUT' and status='SENDING' for update",clinic,messageId);
  if(rows.isEmpty()) return;
  var m=rows.getFirst(); UUID id=(UUID)m.get("id");
  boolean wasSimulated=(boolean)m.get("simulated");
  if(wasSimulated!=simulated(clinic)){failed(clinic,id,"Cambió el modo del canal; revisar el mensaje antes de reenviarlo.");return;}
  var p=em.find(Patient.class,m.get("patient_id"),LockModeType.PESSIMISTIC_WRITE);
  if(p==null || !p.getClinicId().equals(clinic) || !p.isActive() || !p.isWhatsappConsent()
    || !Phones.toWhatsApp(p.getPhone()).orElse("").equals(m.get("phone"))) {failed(clinic,id,"Paciente sin autorización vigente o teléfono modificado.");return;}
  var a=em.find(Appointment.class,m.get("appointment_id"),LockModeType.PESSIMISTIC_WRITE);
  boolean reminder="REMINDER".equals(m.get("kind"));
  if(a==null || !a.getClinicId().equals(clinic) || !a.getPatientId().equals(p.getId()) || !a.getStartsAt().equals(((java.sql.Timestamp)m.get("appointment_starts_at")).toInstant())
    || (reminder && (!a.getStatus().isOpen() || !a.getStartsAt().isAfter(Instant.now()) || !settings(clinic).remindersEnabled()))) {failed(clinic,id,"La cita cambió o los recordatorios están desactivados.");return;}
  if(!reminder && !wasSimulated) {
   boolean window=Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from message where id=? and clinic_id=? and direction='IN' and not simulated and provider_timestamp>now()-interval '24 hours')",Boolean.class,m.get("reply_for"),clinic));
   if(!window){failed(clinic,id,"La ventana de respuesta de WhatsApp venció.");return;}
  }
  MessageSender channel=sender(clinic);
  MessageSender.SendResult result;
  if(reminder) {
   var names=db.queryForMap("select c.name clinic_name,s.name site_name from clinic c join site s on s.clinic_id=c.id where c.id=? and s.id=?",clinic,a.getSiteId());
   result=channel.sendTemplate((String)m.get("phone"),(String)m.get("template"),config.whatsapp().templateLanguage(),List.of(p.getFirstName(),(String)names.get("clinic_name"),DATE.format(a.getStartsAt()),(String)names.get("site_name")));
  } else result=channel.sendText((String)m.get("phone"),(String)m.get("body"));
  if(result.ok()) db.update("update message set status=?,provider_message_id=?,processed_at=now() where id=? and clinic_id=?",wasSimulated?"SIMULATED":"SENT",result.providerMessageId(),id,clinic);
  else failed(clinic,id,result.error());
  // No se reintenta automáticamente un fallo/timeout: el proveedor pudo aceptar el envío.
 }
 private void failed(UUID clinic,UUID id,String error) {db.update("update message set status='FAILED',error=?,needs_attention=true,processed_at=now() where id=? and clinic_id=?",error,id,clinic);}

 @Transactional
 public UUID simulate(UUID clinic,Simulation request) {
  if(!simulated(clinic)) throw new ConflictException("El simulador está disponible únicamente en modo simulado.");
  var list=db.queryForList("select * from message where id=? and clinic_id=? and kind='REMINDER' and simulated and status='SIMULATED'",request.reminderId(),clinic);
  if(list.isEmpty()) throw new NotFoundException("Recordatorio simulado no encontrado.");
  var parent=list.getFirst();
  return insertInbound(clinic,(String)parent.get("phone"),"sim-in-"+UUID.randomUUID(),(String)parent.get("provider_message_id"),request.text(),null,Instant.now(),true);
 }
 @Transactional
 public UUID ingest(UUID clinic,String phone,String providerId,String replyTo,String text,String button,Instant at) {
  if(simulated(clinic)) throw new ConflictException("El webhook real requiere un canal habilitado.");
  return insertInbound(clinic,phone,providerId,replyTo,text,button,at,false);
 }
 private UUID insertInbound(UUID clinic,String phone,String providerId,String replyTo,String text,String button,Instant at,boolean simulation) {
  var previous=db.queryForList("select id from message where clinic_id=? and provider_message_id=? and direction='IN'",clinic,providerId);
  if(!previous.isEmpty()) return (UUID)previous.getFirst().get("id");
  // El contexto es el id del recordatorio enviado, nunca una cita escogida por el texto o la IA.
  List<Map<String,Object>> parents;
  if(replyTo!=null) parents=db.queryForList("select * from message where clinic_id=? and provider_message_id=? and phone=? and kind='REMINDER' and simulated=? and status in ('SENT','SIMULATED')",clinic,replyTo,phone,simulation);
  else parents=db.queryForList("""
    select m.* from message m join appointment a on a.id=m.appointment_id and a.clinic_id=m.clinic_id
    where m.clinic_id=? and m.phone=? and m.kind='REMINDER' and m.simulated=? and m.status in ('SENT','SIMULATED')
    and m.created_at>now()-interval '72 hours' and a.starts_at>now() and a.status in ('SCHEDULED','CONFIRMED')
    and a.starts_at=m.appointment_starts_at order by m.created_at desc limit 2
    """,clinic,phone,simulation);
  var parent=parents.size()==1?parents.getFirst():null;
  UUID id=UUID.randomUUID();
  db.update("""
   insert into message(id,clinic_id,patient_id,appointment_id,direction,kind,phone,body,status,provider_message_id,
   reply_to_provider_id,appointment_starts_at,simulated,button_payload,provider_timestamp)
   values(?,?,?,?,'IN','INBOUND',?,?,'RECEIVED',?,?,?,?,?,?) on conflict do nothing
   """,id,clinic,parent==null?null:parent.get("patient_id"),parent==null?null:parent.get("appointment_id"),phone,text,providerId,replyTo,
    parent==null?null:parent.get("appointment_starts_at"),simulation,button,java.sql.Timestamp.from(at));
  return id;
 }
 @Transactional
 public boolean processOne(UUID clinic) {
  var rows=db.queryForList("select * from message where clinic_id=? and direction='IN' and status='RECEIVED' order by created_at limit 1 for update skip locked",clinic);
  if(rows.isEmpty()) return false;
  var m=rows.getFirst(); UUID id=(UUID)m.get("id");
  boolean simulation=(boolean)m.get("simulated");
  var decision=classifier.classify((String)m.get("body"),(String)m.get("button_payload"),!simulation && settings(clinic).aiEnabled());
  String action="REVIEW"; boolean attention=true;
  var p=m.get("patient_id")==null || decision.intent()==ReplyClassifier.Intent.OPT_OUT?null:em.find(Patient.class,m.get("patient_id"),LockModeType.PESSIMISTIC_WRITE);
  boolean validPatient=p!=null && p.getClinicId().equals(clinic) && Phones.toWhatsApp(p.getPhone()).orElse("").equals(m.get("phone"));
  if(decision.intent()==ReplyClassifier.Intent.OPT_OUT && decision.explicit()) {
   // BAJA se aplica a todos los pacientes de esta clínica que comparten ese teléfono.
   var ids=db.query("select id,phone from patient where clinic_id=? order by id for update",(r,n)->new AbstractMap.SimpleEntry<>(uuid(r,"id"),r.getString("phone")),clinic);
   for(var entry:ids) if(Phones.toWhatsApp(entry.getValue()).orElse("").equals(m.get("phone"))) {
    var patient=em.find(Patient.class,entry.getKey()); patient.setWhatsappConsent(false); patient.setWhatsappConsentAt(null);
   }
   action="UNSUBSCRIBED"; attention=false;
  } else if(validPatient && p.isActive() && p.isWhatsappConsent() && m.get("appointment_id")!=null) {
   var a=em.find(Appointment.class,m.get("appointment_id"),LockModeType.PESSIMISTIC_WRITE);
   Instant snapshot=m.get("appointment_starts_at")==null?null:((java.sql.Timestamp)m.get("appointment_starts_at")).toInstant();
   Instant received=((java.sql.Timestamp)m.get("provider_timestamp")).toInstant();
   boolean current=a!=null && a.getClinicId().equals(clinic) && a.getPatientId().equals(p.getId()) && a.getStartsAt().equals(snapshot)
      && a.getStartsAt().isAfter(Instant.now()) && received.isAfter(Instant.now().minus(Duration.ofHours(24)));
   if(current && a.getStatus().isOpen() && decision.explicit()) {
    if(decision.intent()==ReplyClassifier.Intent.CONFIRM) {
     if(a.getStatus()==AppointmentStatus.SCHEDULED) appointments.changeStatus(clinic,a.getId(),new AgendaDtos.StatusRequest(AppointmentStatus.CONFIRMED,null));
     action="CONFIRMED";attention=false;
    } else if(decision.intent()==ReplyClassifier.Intent.CANCEL) {
     appointments.changeStatus(clinic,a.getId(),new AgendaDtos.StatusRequest(AppointmentStatus.CANCELLED,"Cancelada por el paciente vía WhatsApp"));
     action="CANCELLED";attention=false;
    }
   } else if(!current) action="STALE_APPOINTMENT";
   if(!attention) queueReply(clinic,m,action.equals("CONFIRMED")?"Tu cita quedó confirmada. Gracias.":"Tu cita quedó cancelada. Si deseas reprogramarla, contacta a recepción.");
  }
  db.update("update message set status='PROCESSED',intent=?,intent_source=?,intent_summary=?,action=?,needs_attention=?,processed_at=now() where id=? and clinic_id=?",decision.intent().name(),decision.source(),decision.summary(),action,attention,id,clinic);
  return true;
 }
 private void queueReply(UUID clinic,Map<String,Object> m,String body) {
  db.update("""
   insert into message(id,clinic_id,patient_id,appointment_id,direction,kind,phone,body,status,appointment_starts_at,simulated,reply_for)
   values(?,?,?,?,'OUT','REPLY',?,?,'QUEUED',?,?,?) on conflict do nothing
   """,UUID.randomUUID(),clinic,m.get("patient_id"),m.get("appointment_id"),m.get("phone"),body,m.get("appointment_starts_at"),m.get("simulated"),m.get("id"));
 }
 @Transactional
 public void resolve(AuthUser me,UUID id,Resolution request) {
  if(request.note().trim().length()<3) throw new BadRequestException("Indica cómo se atendió el mensaje.");
  int changed=db.update("update message set resolved_by=?,resolved_at=now(),resolution_note=? where clinic_id=? and id=? and needs_attention and resolved_at is null",me.userId(),request.note().trim(),me.clinicId(),id);
  if(changed==0) throw new ConflictException("El mensaje no tiene atención pendiente o ya fue atendido.");
 }
 @Transactional
 public void delivery(UUID clinic,String providerId,String status,Instant at) {
  if(!Set.of("sent","delivered","read","failed").contains(status)) return;
  // Nunca degradar READ/DELIVERED por reenvíos de estados antiguos.
  db.update("""
   update message set delivery_status=?,needs_attention=needs_attention or ?='failed' where clinic_id=? and direction='OUT' and not simulated and provider_message_id=?
   and (delivery_status is null or delivery_status='sent' or (delivery_status='delivered' and ?='read'))
   """,status,status,clinic,providerId,status);
 }
}
