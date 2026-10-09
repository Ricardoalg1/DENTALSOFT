package lat.occlus.messaging;

import java.util.UUID;
import lat.occlus.platform.AppModule;
import lat.occlus.shared.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component @RequiredArgsConstructor @Slf4j
public class MessagingWorker {
 private final MessagingService messages;
 private final MessagingProperties config;
 /** Un módulo desactivado o una suscripción sin acceso detiene también los procesos de fondo. */
 private final lat.occlus.platform.Entitlements entitlements;
 public void drain(UUID clinic) {
  for(int n=0;n<50 && messages.processOne(clinic);n++) { }
  for(int n=0;n<100;n++) {
   UUID id=messages.claimOutgoing(clinic); if(id==null) break;
   messages.sendClaimed(clinic,id);
  }
 }
 @Scheduled(fixedDelayString="${occlus.messaging.reminder-interval:PT5M}")
 public void reminders() {
  if(!config.schedulerEnabled()) return;
  var clinics=TenantContext.callAsSystem(messages::enabledClinics);
  for(UUID clinic:clinics) try {
   TenantContext.callAs(clinic,()->{if(!entitlements.allows(clinic,AppModule.MESSAGING)) return null;messages.queueReminders(clinic);drain(clinic);return null;});
  } catch(RuntimeException e){log.warn("No se completó el ciclo de mensajería para una clínica ({})",e.getClass().getSimpleName());}
 }
 @Scheduled(fixedDelayString="${occlus.messaging.inbound-interval:PT5S}")
 public void inbound() {
  if(!config.schedulerEnabled()) return;
  // Las respuestas se procesan incluso después de apagar recordatorios.
  var clinics=TenantContext.callAsSystem(messages::enabledClinics);
  var live=config.whatsapp().clinicId();
  if(live!=null && !clinics.contains(live)) {clinics=new java.util.ArrayList<>(clinics);clinics.add(live);}
  for(UUID clinic:clinics) try {TenantContext.callAs(clinic,()->{if(!entitlements.allows(clinic,AppModule.MESSAGING)) return null;drain(clinic);return null;});}
  catch(RuntimeException e){log.warn("No se completó el procesamiento de respuestas ({})",e.getClass().getSimpleName());}
 }
}
