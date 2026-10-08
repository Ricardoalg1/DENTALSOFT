package lat.occlus.billing;

import static lat.occlus.billing.BillingDtos.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import org.springframework.stereotype.Service;

/** Estructura local v003 (15-07-2026). La validación oficial y el CUV corresponden al MUV. */
@Service
public class RipsDraftService {
    public static final String STANDARD = "Resolución 0948/2026 · Documento técnico 1 v003 (15-07-2026)";
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(ZoneId.of("America/Bogota"));

    public Validation validate(Snapshot s) {
        var errors = new ArrayList<String>();
        if (s.issuer() == null) errors.add("Configura los datos fiscales y el código del prestador.");
        if (s.user() == null) errors.add("Completa la cobertura, los países y la residencia del paciente.");
        else {
            if ("170".equals(s.user().countryResidence()) && (s.user().municipality() == null || s.user().zone() == null))
                errors.add("Para residencia en Colombia se exige municipio DIVIPOLA y zona territorial.");
            if (Set.of("10","14").contains(s.user().userType()) && (s.user().siras() == null || s.user().siras().isBlank()))
                errors.add("El tipo de usuario seleccionado requiere registro SIRAS.");
        }
        if (s.lines().isEmpty()) errors.add("Selecciona al menos un procedimiento realizado.");
        for (int i=0; i<s.lines().size(); i++) {
            var line = s.lines().get(i);
            String prefix = "Ítem " + (i+1) + ": ";
            if (line.total().stripTrailingZeros().scale()>0) errors.add(prefix+"RIPS exige un valor de servicio entero; revisa el importe sin redondearlo automáticamente.");
            if (line.total().signum()<=0) errors.add(prefix+"la facturación por evento exige un valor de servicio mayor que cero.");
            if (line.quantity()!=1) errors.add(prefix+"registra cada atención por separado para generar su RIPS.");
            if (line.rips()==null) { errors.add(prefix+"vincula una evolución firmada y completa su clasificación RIPS."); continue; }
            var r = line.rips();
            if (r.kind()==ServiceKind.PROCEDURE && r.entryRoute()==null) errors.add(prefix+"falta vía de ingreso.");
            if (r.kind()==ServiceKind.CONSULTATION && r.cause()==null) errors.add(prefix+"falta causa de atención.");
            if (line.attendedAt()==null || line.attendedAt().isAfter(Instant.now())) errors.add(prefix+"fecha de atención inválida.");
            if (line.attendedAt()!=null && line.attendedAt().atZone(ZoneId.of("America/Bogota")).toLocalDate().isBefore(s.birthDate()))
                errors.add(prefix+"la atención no puede ser anterior al nacimiento.");
            if (line.diagnosisMain()==null) errors.add(prefix+"falta diagnóstico principal de la evolución.");
            if (r.moderatingPayment().compareTo(line.total())>0) errors.add(prefix+"el pago moderador supera el valor del servicio.");
            if ("05".equals(r.collectionConcept()) && (r.moderatingPayment().signum()!=0 || r.moderatingInvoice()!=null))
                errors.add(prefix+"sin recaudo no debe informarse pago moderador ni su factura.");
            if (r.moderatingPayment().signum()>0 && (r.moderatingInvoice()==null || r.moderatingInvoice().isBlank()))
                errors.add(prefix+"informa la FEV que soporta el pago moderador.");
            if (Set.of("02","04").contains(r.collectionConcept()) && r.moderatingPayment().compareTo(BigDecimal.ONE)<0)
                errors.add(prefix+"la cuota moderadora o el bono debe tener un valor mayor o igual a uno.");
        }
        return new Validation(errors.isEmpty(),errors,List.of(
                "Validación local de estructura; los catálogos SISPRO y las reglas cruzadas deben verificarse en el MUV.",
                "Falta la emisión por el proveedor DIAN y el número de FEV. Este JSON es un borrador sin CUFE ni CUV."));
    }

    public RipsPreview preview(Snapshot s) {
        var root = new LinkedHashMap<String,Object>();
        root.put("numDocumentoIdObligado",s.issuer()==null?null:s.issuer().nit());
        root.put("numFactura",null);
        root.put("tipoNota",null);
        root.put("numNota",null);
        var user = new LinkedHashMap<String,Object>();
        user.put("tipoDocumentoIdentificacion",s.documentType());
        user.put("numDocumentoIdentificacion",s.documentNumber());
        user.put("tipoUsuario",s.user()==null?null:s.user().userType());
        user.put("fechaNacimiento",s.birthDate().toString());
        user.put("codSexo",s.sex());
        user.put("codPaisResidencia",s.user()==null?null:s.user().countryResidence());
        user.put("codMunicipioResidencia",s.user()==null?null:s.user().municipality());
        user.put("codZonaTerritorialResidencia",s.user()==null?null:s.user().zone());
        user.put("incapacidad",s.user()==null?null:s.user().incapacity());
        user.put("consecutivo",1);
        user.put("codPaisOrigen",s.user()==null?null:s.user().countryOrigin());
        user.put("registroSIRAS",s.user()==null?null:s.user().siras());
        var services = new LinkedHashMap<String,Object>();
        var consultations = new ArrayList<Map<String,Object>>();
        var procedures = new ArrayList<Map<String,Object>>();
        for (var line : s.lines()) {
            if (line.rips()==null) continue;
            var r = line.rips();
            var m = new LinkedHashMap<String,Object>();
            m.put("codPrestador",s.issuer()==null?null:s.issuer().providerCode());
            m.put("fechaInicioAtencion",line.attendedAt()==null?null:DATE.format(line.attendedAt()));
            m.put("numAutorizacion",r.authorization());
            m.put(r.kind()==ServiceKind.CONSULTATION?"codConsulta":"codProcedimiento",r.cupsCode());
            m.put("modalidadGrupoServicioTecSal",r.modality());
            m.put("grupoServicios",r.group());
            m.put("codServicio",r.serviceCode());
            m.put("finalidadTecnologiaSalud",r.purpose());
            m.put("tipoDocumentoIdentificacion",s.documentType());
            m.put("numDocumentoIdentificacion",s.documentNumber());
            m.put("codDiagnosticoPrincipal",line.diagnosisMain());
            m.put("codDiagnosticoPrincipalCIE11",null);
            m.put("nomCodDiagnosticoPrincipalCIE11",null);
            if (r.kind()==ServiceKind.CONSULTATION) {
                m.put("causaMotivoAtencion",r.cause());
                m.put("tipoDiagnosticoPrincipal",line.diagnosisType());
                for(int i=1;i<=3;i++) {
                    m.put("codDiagnosticoRelacionado"+i,line.diagnosesRelated().size()>=i?line.diagnosesRelated().get(i-1):null);
                    m.put("codDiagnosticoRelacionado"+i+"CIE11",null);
                    m.put("nomCodDiagnosticoRelacionado"+i+"CIE11",null);
                }
            } else {
                m.put("idMIPRES",r.mipres());
                m.put("viaIngresoServicioSalud",r.entryRoute());
                m.put("codDiagnosticoRelacionado",line.diagnosesRelated().isEmpty()?null:line.diagnosesRelated().getFirst());
                m.put("codDiagnosticoRelacionadoCIE11",null);
                m.put("nomCodDiagnosticoRelacionadoCIE11",null);
                m.put("codComplicacion",null);
                m.put("codComplicacionCIE11",null);
                m.put("nomCodComplicacionCIE11",null);
            }
            m.put("vrServicio",line.total());
            m.put("conceptoRecaudo",r.collectionConcept());
            m.put("valorPagoModerador",r.moderatingPayment());
            m.put("numFEVPagoModerador",r.moderatingInvoice());
            m.put("codigoVIDA",r.vida());
            var target = r.kind()==ServiceKind.CONSULTATION?consultations:procedures;
            m.put("consecutivo",target.size()+1);
            target.add(m);
        }
        if (!consultations.isEmpty()) services.put("consultas",consultations);
        if (!procedures.isEmpty()) services.put("procedimientos",procedures);
        user.put("servicios",services);
        root.put("usuarios",List.of(user));
        return new RipsPreview(STANDARD,true,validate(s),root);
    }
}
