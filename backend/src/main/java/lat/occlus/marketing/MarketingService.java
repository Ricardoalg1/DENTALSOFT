package lat.occlus.marketing;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Set;
import java.util.UUID;
import lat.occlus.shared.security.AuthUser;
import lat.occlus.shared.tenant.TenantContext;
import lat.occlus.shared.web.ForbiddenException;
import lat.occlus.user.Role;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service @RequiredArgsConstructor @EnableConfigurationProperties(MarketingProperties.class)
public class MarketingService {
 private final MarketingProperties config;
 private final MarketingStore store;
 private static final Set<String> PAGES=Set.of("/","/planes","/demo","/blog","/privacidad","/condiciones","/blog/organizar-agenda-clinica","/blog/control-insumos-odontologia","/blog/seguimiento-presupuestos");
 public boolean allowed(AuthUser me){return me.role()==Role.ADMIN && config.adminUserIds()!=null && config.adminUserIds().contains(me.userId());}
 private void requireAdmin(AuthUser me){if(!allowed(me)) throw new ForbiddenException("Este CRM es exclusivo del equipo autorizado de Occlus.");}
 private void requireKey(String key){
  if(config.publicKey()==null || config.publicKey().length()<32) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"El formulario comercial todavía no está habilitado.");
  if(key==null || !MessageDigest.isEqual(key.getBytes(StandardCharsets.UTF_8),config.publicKey().getBytes(StandardCharsets.UTF_8))) throw new ForbiddenException("Acceso al sitio no autorizado.");
 }
 public void create(String key,MarketingDtos.DemoRequest request){requireKey(key);TenantContext.callAsSystem(()->{store.create(request);return null;});}
 public void event(String key,String path){requireKey(key);if(config.analyticsEnabled() && PAGES.contains(path)) TenantContext.callAsSystem(()->{store.event(path);return null;});}
 public MarketingDtos.Crm overview(AuthUser me,String query,String status,int page,int size,boolean due){
  requireAdmin(me);
  if(query.length()>160 || page<1 || page>1000000 || size<1 || size>100) throw new lat.occlus.shared.web.BadRequestException("Filtros de consulta inválidos.");
  if(!status.isEmpty())try{MarketingDtos.Status.valueOf(status);}catch(IllegalArgumentException ex){throw new lat.occlus.shared.web.BadRequestException("Estado inválido.");}
  return TenantContext.callAsSystem(()->store.overview(query.trim(),status,page,size,due));
 }
 public MarketingDtos.Lead detail(AuthUser me,UUID id){requireAdmin(me);return TenantContext.callAsSystem(()->store.detail(id));}
 public void erase(AuthUser me,UUID id){requireAdmin(me);TenantContext.callAsSystem(()->{store.erase(id,me.userId());return null;});}
 public void update(AuthUser me,UUID id,MarketingDtos.Update request){requireAdmin(me);TenantContext.callAsSystem(()->{store.update(id,me.userId(),request);return null;});}
 public java.util.List<MarketingDtos.Activity> history(AuthUser me,UUID id){requireAdmin(me);return TenantContext.callAsSystem(()->store.history(id));}
}
