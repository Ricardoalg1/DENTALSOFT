/**
 * Acuerdo de encargo de tratamiento de datos entre Occlus (encargado) y cada clínica (responsable).
 * Al cambiar el texto, sube AGREEMENT_VERSION aquí y CURRENT_VERSION en AgreementController (backend):
 * cada clínica deberá aceptar de nuevo. Debe ser revisado por asesoría jurídica antes de usarse con clientes.
 */
export const AGREEMENT_VERSION = "2026-10-v1";
export const AGREEMENT_TITLE = "Acuerdo de encargo de tratamiento de datos y términos del servicio";

export type AgreementStatus = { version: string; accepted: boolean; acceptedAt: string | null; acceptedBy: string | null };

export const AGREEMENT_SECTIONS: { title: string; paragraphs: string[] }[] = [
  {
    title: "1. Partes y objeto",
    paragraphs: [
      "Este acuerdo se celebra entre SINE SAS, que opera la plataforma Occlus («Occlus»), y la clínica que acepta este documento («la Clínica»). Regula el uso de Occlus y el tratamiento de datos personales que Occlus realiza por cuenta de la Clínica.",
    ],
  },
  {
    title: "2. Roles",
    paragraphs: [
      "La Clínica es la responsable del tratamiento de los datos de sus pacientes y de su personal: decide sobre su recolección, finalidad y uso, y es quien obtiene la autorización de los titulares.",
      "Occlus actúa como encargado: almacena y procesa esos datos únicamente para prestar el servicio y siguiendo las instrucciones de la Clínica. Para sus propios datos comerciales y de usuarios de la plataforma, Occlus es responsable, según su política de privacidad.",
    ],
  },
  {
    title: "3. Obligaciones de Occlus como encargado",
    paragraphs: [
      "a) Tratar los datos solo para prestar el servicio, sin venderlos, cederlos ni usarlos para fines propios distintos.",
      "b) Mantener medidas técnicas y administrativas de seguridad: conexión cifrada, aislamiento de la información de cada clínica, control de acceso por rol, auditoría de cambios en la información clínica, sesiones revocables y copias de seguridad.",
      "c) Guardar confidencialidad y exigirla a su personal y proveedores con acceso a los datos.",
      "d) Informar a la Clínica sin demora, y a más tardar dentro de las 72 horas siguientes a que tenga conocimiento, cualquier incidente de seguridad que afecte sus datos, y colaborar en su gestión y en las notificaciones que correspondan.",
      "e) Colaborar para que la Clínica atienda las consultas y reclamos de los titulares y las solicitudes de las autoridades.",
    ],
  },
  {
    title: "4. Obligaciones de la Clínica como responsable",
    paragraphs: [
      "a) Obtener y conservar la autorización de sus pacientes para el tratamiento de sus datos, incluida la de datos sensibles de salud y la de menores de edad por medio de sus representantes. Occlus incluye una plantilla de autorización que la Clínica puede adaptar y hacer firmar desde el módulo de consentimientos.",
      "b) Cargar solo los datos necesarios y veraces, y cumplir las normas de historia clínica (Resolución 1995 de 1999, Resolución 839 de 2017 y demás aplicables).",
      "c) Gestionar sus usuarios y permisos, mantener la confidencialidad de las credenciales y dar de baja a quien ya no deba acceder.",
      "d) Atender las consultas y reclamos de los titulares dentro de los plazos legales.",
      "e) Mantener sus propias políticas y avisos de privacidad conforme a la Ley 1581 de 2012.",
    ],
  },
  {
    title: "5. Datos sensibles y de menores",
    paragraphs: [
      "La Clínica reconoce que los datos de salud son sensibles y que su suministro es facultativo para el titular. Occlus solo los trata para prestar el servicio y bajo las medidas de seguridad descritas.",
    ],
  },
  {
    title: "6. Proveedores y transferencias",
    paragraphs: [
      "Para prestar el servicio, Occlus usa proveedores como encargados o subencargados, entre ellos Amazon Web Services (alojamiento) y, solo si la Clínica los activa, Meta (WhatsApp), Dataico (facturación electrónica) y Wompi o ePayco (pagos). Algunos pueden procesar datos fuera de Colombia. Occlus exigirá a sus proveedores garantías equivalentes y la Clínica autoriza este uso.",
    ],
  },
  {
    title: "7. Conservación, devolución y supresión",
    paragraphs: [
      "La Clínica es responsable de conservar la historia clínica durante el plazo que ordena la normatividad de salud. Occlus no eliminará los datos de la Clínica por iniciativa propia mientras el acuerdo esté vigente.",
      "Al terminar el servicio, la Clínica podrá exportar su información durante 30 días. Después, Occlus suprimirá los datos de sus sistemas, salvo los que deba conservar por obligación legal, y las copias de seguridad se eliminarán por rotación en un plazo máximo de 35 días.",
    ],
  },
  {
    title: "8. Periodo de piloto y alcance del servicio",
    paragraphs: [
      "Mientras la Clínica use Occlus como piloto, el servicio se presta tal como está, sin compromiso de disponibilidad continua, y puede tener cambios o interrupciones. Las condiciones económicas, si las hay, constan en la propuesta comercial acordada.",
      "Occlus es una herramienta tecnológica: no presta servicios de salud ni reemplaza el criterio clínico ni las obligaciones legales de la Clínica y sus profesionales. Las integraciones con terceros (facturación electrónica, mensajería, pagos) requieren configuración y activación, y su disponibilidad depende de esos proveedores.",
    ],
  },
  {
    title: "9. Responsabilidad",
    paragraphs: [
      "Cada parte responde por el incumplimiento de las obligaciones que asume en este acuerdo y por la ley. La responsabilidad de Occlus se limita a los daños directos y comprobados, hasta el monto que la Clínica haya pagado por el servicio en los 12 meses anteriores al hecho, salvo en los casos en que la ley no permita limitarla.",
    ],
  },
  {
    title: "10. Duración y terminación",
    paragraphs: [
      "El acuerdo rige mientras la Clínica use Occlus. Cualquiera de las partes puede terminarlo con aviso de 15 días, y de inmediato en caso de incumplimiento grave. Las obligaciones de confidencialidad y de seguridad subsisten mientras Occlus conserve datos de la Clínica.",
    ],
  },
  {
    title: "11. Ley aplicable y aceptación electrónica",
    paragraphs: [
      "Este acuerdo se rige por las leyes de Colombia. La aceptación se hace por medios electrónicos, conforme a la Ley 527 de 1999: Occlus registra quién aceptó, cuándo, desde qué dirección y qué versión del texto, y ese registro sirve como prueba.",
    ],
  },
];
