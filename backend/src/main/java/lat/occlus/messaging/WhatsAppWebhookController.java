package lat.occlus.messaging;

import lat.occlus.platform.AppModule;

import lat.occlus.platform.SkipEntitlements;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import lat.occlus.shared.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Endpoint público solo para Meta: firma del cuerpo original y enrutamiento por número receptor. */
@SkipEntitlements
@RestController @RequestMapping("/api/webhooks/whatsapp") @RequiredArgsConstructor
public class WhatsAppWebhookController {
 private final MessagingProperties config;
 private final MessagingService messages;
 private final lat.occlus.platform.Entitlements entitlements;
 private final ObjectMapper mapper;
 @GetMapping
 public ResponseEntity<String> verify(@RequestParam("hub.mode") String mode,
  @RequestParam("hub.verify_token") String token,@RequestParam("hub.challenge") String challenge) {
  if(!config.whatsapp().configured() || !"subscribe".equals(mode) || !equal(token,config.whatsapp().verifyToken())) throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Verificación rechazada.");
  return ResponseEntity.ok().contentType(org.springframework.http.MediaType.TEXT_PLAIN).body(challenge);
 }
 @PostMapping
 public ResponseEntity<Void> receive(@RequestBody byte[] body,
  @RequestHeader(value="X-Hub-Signature-256",required=false) String signature) {
  if(!config.whatsapp().configured()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"El canal WhatsApp no está habilitado.");
  if(body.length>262144) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE);
  if(!validSignature(body,signature)) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Firma inválida.");
  JsonNode root;
  try {root=mapper.readTree(body);} catch(RuntimeException e){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"JSON inválido.");}
  if(root==null || !root.isObject()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Se requiere un objeto JSON.");
  if(!"whatsapp_business_account".equals(root.path("object").asString(""))) return ResponseEntity.ok().build();
  for(var entry:root.path("entry")) for(var change:entry.path("changes")) {
   if(!"messages".equals(change.path("field").asString(""))) continue;
   var value=change.path("value");
   if(!config.whatsapp().phoneNumberId().equals(value.path("metadata").path("phone_number_id").asString(""))) continue;
   TenantContext.callAs(config.whatsapp().clinicId(),()->{
    // Sin módulo o sin suscripción con acceso: se responde 200 a Meta (para que no reintente) y se descarta.
    if(!entitlements.allows(config.whatsapp().clinicId(),AppModule.MESSAGING)) return null;
    for(var message:value.path("messages")) inbound(message);
    for(var status:value.path("statuses")) {
     String id=status.path("id").asString("");
     if(!id.isBlank() && id.length()<=150) messages.delivery(config.whatsapp().clinicId(),id,status.path("status").asString(""),timestamp(status));
    }
    return null;
   });
  }
  return ResponseEntity.ok().build();
 }
 private void inbound(JsonNode node) {
  String id=node.path("id").asString(""); String phone=node.path("from").asString("");
  if(id.isBlank() || id.length()>150 || !phone.matches("[0-9]{8,15}")) return;
  String type=node.path("type").asString("");
  String button=null; String text;
  switch(type) {
   case "text" -> text=node.path("text").path("body").asString("");
   case "button" -> {text=node.path("button").path("text").asString("");button=node.path("button").path("payload").asString("");}
   case "interactive" -> {
    var reply=node.path("interactive").path("button_reply");
    text=reply.path("title").asString("Mensaje interactivo para revisión");button=reply.path("id").asString("");
   }
   default -> text="[Mensaje de tipo no compatible: "+type.substring(0,Math.min(type.length(),40))+"]";
  }
  if(text.isBlank()) text="[Mensaje sin texto: revisión de recepción]";
  text=text.substring(0,Math.min(text.length(),2000));
  String reply=node.path("context").path("id").asString("");
  if(reply.isBlank() || reply.length()>150) reply=null;
  if(button!=null && button.length()>100) button=null;
  Instant at=timestamp(node);
  if(at.isAfter(Instant.now().plusSeconds(300))) return;
  messages.ingest(config.whatsapp().clinicId(),phone,id,reply,text,button,at);
 }
 private static Instant timestamp(JsonNode node) {
  try{return Instant.ofEpochSecond(Long.parseLong(node.path("timestamp").asString("0")));}
  catch(RuntimeException e){return Instant.EPOCH;}
 }
 private boolean validSignature(byte[] body,String signature) {
  if(signature==null || !signature.matches("sha256=[a-fA-F0-9]{64}")) return false;
  try {
   var mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(config.whatsapp().appSecret().getBytes(StandardCharsets.UTF_8),"HmacSHA256"));
   return MessageDigest.isEqual(mac.doFinal(body),HexFormat.of().parseHex(signature.substring(7)));
  } catch(java.security.GeneralSecurityException | IllegalArgumentException e){return false;}
 }
 private static boolean equal(String a,String b){return a!=null && b!=null && MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8),b.getBytes(StandardCharsets.UTF_8));}
}
