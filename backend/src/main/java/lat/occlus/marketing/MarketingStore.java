package lat.occlus.marketing;

import static lat.occlus.marketing.MarketingDtos.*;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import lat.occlus.shared.web.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@Service @RequiredArgsConstructor
public class MarketingStore {
 private final JdbcTemplate db;
 @Transactional
 public void create(DemoRequest r) {
  // Serializa recepción y límites persistentes; no depende de memoria de una instancia.
  db.queryForList("select pg_advisory_xact_lock(78415019)");
  String email=r.email().trim().toLowerCase(Locale.ROOT);
  boolean duplicate=Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from demo_lead where email=? and created_at>now()-interval '24 hours')",Boolean.class,email));
  if(duplicate) return;
  if(db.queryForObject("select count(*) from demo_lead where created_at>now()-interval '1 hour'",Integer.class)>=60) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"Hay muchas solicitudes en este momento. Intenta más tarde.");
  db.update("insert into demo_lead(id,name,email,phone,clinic_name,team_size,plan,message) values(?,?,?,?,?,?,?,?)",UUID.randomUUID(),r.name().trim(),email,r.phone(),r.clinicName().trim(),r.teamSize(),r.plan(),r.message());
 }
 @Transactional
 public void event(String path){db.update("insert into site_metric(day,path,views) values((now() at time zone 'America/Bogota')::date,?,1) on conflict(day,path) do update set views=site_metric.views+1",path);}
 @Transactional(readOnly=true)
 public Crm overview(String query,String status,int page,int size,boolean due) {
  String filter=" where (name ilike ? escape '!' or email ilike ? escape '!' or clinic_name ilike ? escape '!') and (?='' or status=?) and (not ? or (follow_up_on <= (now() at time zone 'America/Bogota')::date and status in ('NEW','CONTACTED','DEMO_SCHEDULED')))";
  String term="%"+query.replace("!","!!").replace("%","!%").replace("_","!_")+"%";
  Object[] params={term,term,term,status,status,due};
  long total=db.queryForObject("select count(*) from demo_lead"+filter,Long.class,params);
  var leads=db.query("select * from demo_lead"+filter+" order by (status in ('NEW','CONTACTED','DEMO_SCHEDULED')) desc,follow_up_on asc nulls last,created_at desc,id limit ? offset ?",(r,n)->new Lead(r.getObject("id",UUID.class),r.getString("name"),r.getString("email"),r.getString("phone"),r.getString("clinic_name"),r.getString("team_size"),r.getString("plan"),r.getString("message"),Status.valueOf(r.getString("status")),r.getTimestamp("created_at").toInstant(),r.getTimestamp("updated_at").toInstant(),r.getObject("follow_up_on",LocalDate.class)),term,term,term,status,status,due,size,(page-1)*size);
  var counts=db.query("select status,count(*) total from demo_lead group by status",(r,n)->new Count(Status.valueOf(r.getString("status")),r.getLong("total")));
  var metrics=db.query("select * from site_metric where day>=(now() at time zone 'America/Bogota')::date-29 order by day desc,path",(r,n)->new Metric(r.getObject("day",LocalDate.class),r.getString("path"),r.getLong("views")));
  return new Crm(leads,counts,metrics,total,page,size);
 }
 @Transactional(readOnly=true)
 public Lead detail(UUID id) {
  var result=db.query("select * from demo_lead where id=?",(r,n)->new Lead(r.getObject("id",UUID.class),r.getString("name"),r.getString("email"),r.getString("phone"),r.getString("clinic_name"),r.getString("team_size"),r.getString("plan"),r.getString("message"),Status.valueOf(r.getString("status")),r.getTimestamp("created_at").toInstant(),r.getTimestamp("updated_at").toInstant(),r.getObject("follow_up_on",LocalDate.class)),id);
  if(result.isEmpty())throw new NotFoundException("Solicitud no encontrada.");
  return result.getFirst();
 }
 @Transactional
 public void update(UUID id,UUID user,Update request) {
  if(request.note().trim().length()<3) throw new BadRequestException("Describe la gestión realizada.");
  if(db.update("update demo_lead set status=?,follow_up_on=?,updated_at=now() where id=?",request.status().name(),request.followUpOn(),id)==0) throw new NotFoundException("Solicitud no encontrada.");
  db.update("insert into lead_activity(id,lead_id,status,note,created_by) values(?,?,?,?,?)",UUID.randomUUID(),id,request.status().name(),request.note().trim(),user);
 }
 @Transactional
 public void erase(UUID id,UUID actor) {
  if(!Boolean.TRUE.equals(db.queryForObject("select erase_demo_lead(?,?,?)",Boolean.class,id,actor,"PRIVACY_REQUEST")))throw new NotFoundException("Solicitud no encontrada.");
 }
 @Transactional
 public void purgeExpired(int days) {
  // Una única instancia por lote; revalida fechas al bloquear las filas.
  Boolean locked=db.queryForObject("select pg_try_advisory_xact_lock(78415020)",Boolean.class);
  if(!Boolean.TRUE.equals(locked))return;
  var ids=db.queryForList("select id from demo_lead where updated_at < now() - (? * interval '1 day') order by updated_at limit 500 for update skip locked",UUID.class,days);
  for(UUID id:ids)db.queryForObject("select erase_demo_lead(?,null,'RETENTION')",Boolean.class,id);
  db.update("delete from site_metric where day < (now() at time zone 'America/Bogota')::date-89");
 }
 @Transactional(readOnly=true)
 public List<Activity> history(UUID id) {
  if(!Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from demo_lead where id=?)",Boolean.class,id))) throw new NotFoundException("Solicitud no encontrada.");
  return db.query("select a.*,u.full_name from lead_activity a join app_user u on u.id=a.created_by where a.lead_id=? order by a.created_at desc limit 100",(r,n)->new Activity(r.getObject("id",UUID.class),Status.valueOf(r.getString("status")),r.getString("note"),r.getString("full_name"),r.getTimestamp("created_at").toInstant()),id);
 }
}
