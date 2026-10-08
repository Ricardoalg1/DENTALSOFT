package lat.occlus.inventory;

import static lat.occlus.inventory.InventoryDtos.*;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.*;
import lat.occlus.user.Role;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service @RequiredArgsConstructor
public class InventoryService {
 private final JdbcTemplate db;
 private Item item(ResultSet r,int row) throws SQLException {
  return new Item(r.getObject("id",UUID.class),r.getString("code"),r.getString("name"),r.getString("unit"),r.getBigDecimal("minimum"),r.getBoolean("track_lots"),r.getBoolean("active"));
 }
 @Transactional(readOnly=true)
 public Overview overview(UUID clinic) {
  var items=db.query("select * from inventory_item where clinic_id=? order by lower(name)",this::item,clinic);
  var stock=db.query("select * from inventory_batch where clinic_id=? order by expires_on nulls last,lot",(r,n)->new Stock(r.getObject("id",UUID.class),r.getObject("item_id",UUID.class),r.getObject("site_id",UUID.class),r.getString("lot"),r.getObject("expires_on",LocalDate.class),r.getBigDecimal("quantity")),clinic);
  var movements=db.query("""
   select m.*,b.item_id,b.site_id,b.lot,u.full_name from inventory_movement m
   join inventory_batch b on b.id=m.batch_id and b.clinic_id=m.clinic_id
   join app_user u on u.id=m.created_by and u.clinic_id=m.clinic_id
   where m.clinic_id=? order by m.created_at desc,m.id limit 200
   """,(r,n)->new Movement(r.getObject("id",UUID.class),r.getObject("operation_id",UUID.class),r.getObject("item_id",UUID.class),r.getObject("site_id",UUID.class),r.getString("lot"),r.getString("kind"),r.getBigDecimal("delta"),r.getBigDecimal("balance"),r.getString("reason"),r.getString("reference"),r.getString("full_name"),r.getTimestamp("created_at").toInstant()),clinic);
  return new Overview(items,stock,movements);
 }
 @Transactional
 public Item save(AuthUser me,UUID id,ItemRequest r) {
  if(me.role()!=Role.ADMIN) throw new ForbiddenException("Solo administradores pueden gestionar insumos.");
  String code=r.code().trim().toUpperCase(Locale.ROOT);
  if(!db.queryForList("select id from inventory_item where clinic_id=? and code=? and id<>?",me.clinicId(),code,id==null?UUID.randomUUID():id).isEmpty()) throw new ConflictException("Ya existe un insumo con ese código.");
  if(id==null) {
   id=UUID.randomUUID();
   db.update("insert into inventory_item(id,clinic_id,code,name,unit,minimum,track_lots,active) values(?,?,?,?,?,?,?,?)",id,me.clinicId(),code,r.name().trim(),r.unit().trim(),r.minimum(),r.trackLots(),r.active());
  } else {
   var found=db.query("select * from inventory_item where clinic_id=? and id=? for update",this::item,me.clinicId(),id);
   if(found.isEmpty()) throw new NotFoundException("Insumo no encontrado.");
   var old=found.getFirst();
   boolean hasHistory=db.queryForObject("select exists(select 1 from inventory_batch where item_id=? and clinic_id=?)",Boolean.class,id,me.clinicId());
   if(hasHistory && (old.trackLots()!=r.trackLots() || !old.unit().equals(r.unit().trim()))) throw new ConflictException("La unidad y el control de lotes no cambian después de registrar existencias.");
   db.update("update inventory_item set code=?,name=?,unit=?,minimum=?,track_lots=?,active=? where id=? and clinic_id=?",code,r.name().trim(),r.unit().trim(),r.minimum(),r.trackLots(),r.active(),id,me.clinicId());
  }
  return db.query("select * from inventory_item where id=? and clinic_id=?",this::item,id,me.clinicId()).getFirst();
 }
 @Transactional
 public void move(AuthUser me,MovementRequest r) {
  if(me.role()!=Role.ADMIN && me.role()!=Role.ASSISTANT) throw new ForbiddenException("Solo administradores y auxiliares registran movimientos.");
  if(r.kind()==Kind.ADJUSTMENT && me.role()!=Role.ADMIN) throw new ForbiddenException("Solo administradores pueden ajustar existencias.");
  // Un bloqueo por insumo serializa movimientos, reintentos y traslados sin interbloqueos.
  var found=db.query("select * from inventory_item where clinic_id=? and id=? for update",this::item,me.clinicId(),r.itemId());
  if(found.isEmpty()) throw new NotFoundException("Insumo no encontrado.");
  var item=found.getFirst();
  if(!db.queryForList("select id from inventory_movement where clinic_id=? and operation_id=?",me.clinicId(),r.operationId()).isEmpty()) throw new ConflictException("Esta operación ya fue registrada. Revisa el historial antes de repetirla.");
  if(!item.active()) throw new ConflictException("Reactiva el insumo antes de registrar movimientos.");
  site(me.clinicId(),r.siteId());
  if(r.quantity().signum()==0 || (r.kind()!=Kind.ADJUSTMENT && r.quantity().signum()<0)) throw new BadRequestException("La cantidad debe ser positiva; un ajuste admite cantidades negativas.");
  String lot=r.lot()==null?"":r.lot().trim();
  if(r.reason().trim().length()<3) throw new BadRequestException("El motivo debe tener al menos tres caracteres.");
  if(item.trackLots() && (lot.isBlank() || r.expiresOn()==null)) throw new BadRequestException("Este insumo requiere lote y fecha de vencimiento.");
  if(!item.trackLots() && (!lot.isBlank() || r.expiresOn()!=null)) throw new BadRequestException("Este insumo se maneja sin lotes.");
  if(item.trackLots() && !db.queryForList("select id from inventory_batch where clinic_id=? and item_id=? and lot=? and expires_on is distinct from ?::date",me.clinicId(),r.itemId(),lot,r.expiresOn()).isEmpty()) throw new ConflictException("Ese lote ya tiene otra fecha de vencimiento en la clínica.");
  if(r.kind()==Kind.TRANSFER) {
   if(r.destinationSiteId()==null || r.destinationSiteId().equals(r.siteId())) throw new BadRequestException("Selecciona una sede de destino diferente.");
   site(me.clinicId(),r.destinationSiteId());
  }
  UUID batch=batch(me.clinicId(),r.itemId(),r.siteId(),lot,r.expiresOn(),r.kind()==Kind.ENTRY || (r.kind()==Kind.ADJUSTMENT && r.quantity().signum()>0));
  BigDecimal balance=db.queryForObject("select quantity from inventory_batch where id=? and clinic_id=? for update",BigDecimal.class,batch,me.clinicId());
  BigDecimal delta=switch(r.kind()){case CONSUMPTION,DISCARD,TRANSFER->r.quantity().negate();default->r.quantity();};
  if(balance.add(delta).signum()<0) throw new ConflictException("Existencias insuficientes en ese lote y sede.");
  LocalDate today=LocalDate.now(ZoneId.of("America/Bogota"));
  if(r.kind()==Kind.CONSUMPTION && r.expiresOn()!=null && r.expiresOn().isBefore(today)) throw new ConflictException("No se puede consumir un lote vencido. Registra una baja.");
  insert(me,r,batch,r.kind()==Kind.TRANSFER?"TRANSFER_OUT":r.kind().name(),delta);
  if(r.kind()==Kind.TRANSFER) {
   UUID destination=batch(me.clinicId(),r.itemId(),r.destinationSiteId(),lot,r.expiresOn(),true);
   insert(me,r,destination,"TRANSFER_IN",r.quantity());
  }
 }
 private void site(UUID clinic,UUID id) {
  if(!Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from site where id=? and clinic_id=? and active)",Boolean.class,id,clinic))) throw new NotFoundException("Sede activa no encontrada.");
 }
 private UUID batch(UUID clinic,UUID item,UUID site,String lot,LocalDate expires,boolean create) {
  if(create) db.update("insert into inventory_batch(id,clinic_id,item_id,site_id,lot,expires_on) values(?,?,?,?,?,?) on conflict(item_id,site_id,lot) do nothing",UUID.randomUUID(),clinic,item,site,lot,expires);
  var rows=db.queryForList("select id,expires_on from inventory_batch where clinic_id=? and item_id=? and site_id=? and lot=?",clinic,item,site,lot);
  if(rows.isEmpty()) throw new NotFoundException("No hay existencias registradas en ese lote y sede.");
  var b=rows.getFirst();
  LocalDate actual=b.get("expires_on")==null?null:((java.sql.Date)b.get("expires_on")).toLocalDate();
  if(!Objects.equals(actual,expires)) throw new ConflictException("El lote ya tiene otra fecha de vencimiento.");
  return (UUID)b.get("id");
 }
 private void insert(AuthUser me,MovementRequest r,UUID batch,String kind,BigDecimal delta) {
  db.update("insert into inventory_movement(id,clinic_id,batch_id,kind,delta,balance,reason,reference,operation_id,created_by) values(?,?,?,?,?,0,?,?,?,?)",UUID.randomUUID(),me.clinicId(),batch,kind,delta,r.reason().trim(),r.reference(),r.operationId(),me.userId());
 }
}
