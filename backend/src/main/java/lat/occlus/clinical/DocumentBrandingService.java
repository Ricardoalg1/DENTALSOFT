package lat.occlus.clinical;

import java.util.*;
import java.io.*;
import javax.imageio.ImageIO;
import lat.occlus.clinic.ClinicRepository;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.web.*;
import lat.occlus.user.AppUserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service @RequiredArgsConstructor
public class DocumentBrandingService {
 private final JdbcTemplate jdbc; private final ClinicRepository clinics; private final AppUserRepository users;
 public record Branding(String name, String nit, String address, String phone, String email, UUID logoId) {}
 public record Profile(String name, String registration, UUID signatureId) {}
 public record Evidence(String name, String registration, UUID signatureId) {}
 @Transactional(readOnly=true)
 public Branding branding(UUID clinic) {
  var c=clinics.findById(clinic).orElseThrow();
  var rows=jdbc.query("select * from clinic_document_branding where clinic_id=?",(r,n)->new Branding(c.getName(),c.getNit(),r.getString("address"),r.getString("phone"),r.getString("email"),r.getObject("logo_id",UUID.class)),clinic);
  return rows.isEmpty()?new Branding(c.getName(),c.getNit(),"","","",null):rows.getFirst();
 }
 @Transactional(readOnly=true)
 public Profile profile(AuthUser me) {
  var user=users.findByIdAndClinicId(me.userId(),me.clinicId()).orElseThrow(()->new NotFoundException("Colaborador no encontrado"));
  var rows=jdbc.query("select * from user_document_profile where clinic_id=? and user_id=?",(r,n)->new Profile(user.getFullName(),r.getString("registration"),r.getObject("signature_id",UUID.class)),me.clinicId(),me.userId());
  return rows.isEmpty()?new Profile(user.getFullName(),"",null):rows.getFirst();
 }
 @Transactional public Branding saveBranding(AuthUser me,String address,String phone,String email) {
  jdbc.update("insert into clinic_document_branding(clinic_id,address,phone,email,updated_by) values(?,?,?,?,?) on conflict(clinic_id) do update set address=excluded.address,phone=excluded.phone,email=excluded.email,updated_by=excluded.updated_by,updated_at=now()",me.clinicId(),address.trim(),phone.trim(),email.trim(),me.userId()); return branding(me.clinicId());
 }
 @Transactional public Profile saveProfile(AuthUser me,String registration) {
  jdbc.update("insert into user_document_profile(user_id,clinic_id,registration) values(?,?,?) on conflict(user_id) do update set registration=excluded.registration,updated_at=now()",me.userId(),me.clinicId(),registration.trim()); return profile(me);
 }
 @Transactional public UUID upload(AuthUser me,MultipartFile file,boolean logo) {
  var id=UUID.randomUUID(); var png=normalize(file);
  jdbc.update("insert into document_asset(id,clinic_id,owner_id,kind,png) values(?,?,?,?,?)",id,me.clinicId(),me.userId(),logo?"LOGO":"SIGNATURE",png);
  if(logo) jdbc.update("insert into clinic_document_branding(clinic_id,logo_id,updated_by) values(?,?,?) on conflict(clinic_id) do update set logo_id=excluded.logo_id,updated_by=excluded.updated_by,updated_at=now()",me.clinicId(),id,me.userId());
  else jdbc.update("insert into user_document_profile(user_id,clinic_id,signature_id) values(?,?,?) on conflict(user_id) do update set signature_id=excluded.signature_id,updated_at=now()",me.userId(),me.clinicId(),id);
  return id;
 }
 @Transactional public void clear(AuthUser me,boolean logo) {
  if(logo) jdbc.update("update clinic_document_branding set logo_id=null,updated_by=?,updated_at=now() where clinic_id=?",me.userId(),me.clinicId());
  else jdbc.update("update user_document_profile set signature_id=null,updated_at=now() where user_id=? and clinic_id=?",me.userId(),me.clinicId());
 }
 @Transactional(readOnly=true) public byte[] image(UUID clinic,UUID id) {
  if(id==null)return null;
  var rows=jdbc.query("select png from document_asset where id=? and clinic_id=?",(r,n)->r.getBytes(1),id,clinic);
  if(rows.isEmpty())throw new NotFoundException("Imagen no encontrada"); return rows.getFirst();
 }
 @Transactional public void captureNote(AuthUser me,UUID note) {
  var p=profile(me);
  jdbc.update("insert into clinical_note_signature(note_id,clinic_id,author_id,author_name,registration,signature_id) values(?,?,?,?,?,?)",note,me.clinicId(),me.userId(),p.name(),p.registration(),p.signatureId());
 }
 @Transactional(readOnly=true) public Evidence evidence(UUID clinic,UUID note) {
  var rows=jdbc.query("select author_name,registration,signature_id from clinical_note_signature where note_id=? and clinic_id=?",(r,n)->new Evidence(r.getString(1),r.getString(2),r.getObject(3,UUID.class)),note,clinic);
  return rows.isEmpty()?null:rows.getFirst();
 }
 private byte[] normalize(MultipartFile file) {
  if(file.isEmpty() || file.getSize()>1048576)throw new BadRequestException("Sube una imagen PNG o JPEG de hasta 1 MB");
  try(var input=ImageIO.createImageInputStream(file.getInputStream());var out=new ByteArrayOutputStream()) {
   var readers=ImageIO.getImageReaders(input); if(!readers.hasNext())throw new BadRequestException("Formato de imagen inválido");
   var reader=readers.next(); try {
    var format=reader.getFormatName(); if(!format.equalsIgnoreCase("png")&&!format.equalsIgnoreCase("jpeg"))throw new BadRequestException("Solo PNG o JPEG");
    reader.setInput(input,true,true); int w=reader.getWidth(0),h=reader.getHeight(0);
    if(w<1||h<1||w>2000||h>2000|| (long)w*h>2000000)throw new BadRequestException("La imagen debe tener como máximo 2000 px por lado y 2 megapíxeles");
    var image=reader.read(0); ImageIO.write(image,"png",out);
    if(out.size()>2097152)throw new BadRequestException("La imagen normalizada es demasiado grande"); return out.toByteArray();
   } finally {reader.dispose();}
  } catch(IOException e) {throw new BadRequestException("No se pudo leer la imagen");}
 }
}
