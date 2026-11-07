/**
 * Versiones de Occlus (formato mayor.menor). La primera entrada es la versión actual: la muestra el logo
 * y la página de plataforma «Versiones». Al publicar cambios, agrega una entrada arriba.
 */
export type VersionEntry = { version: string; date: string; title: string; changes: string[] };

export const VERSIONS: VersionEntry[] = [
  {
    version: "1.5",
    date: "2026-11-06",
    title: "Reserva de citas en línea y recuperación de contraseña",
    changes: [
      "Página pública de reservas por clínica, en todos los planes: el paciente elige una hora libre y confirma con un código.",
      "Bandeja de solicitudes en la agenda: recepción asocia al paciente y confirma antes de que la cita entre a la agenda.",
      "Enlace para que el paciente cancele o cambie su cita.",
      "Recuperar contraseña por enlace de un solo uso, con correos enviados por Amazon SES.",
      "Verificación en dos pasos para el administrador de la plataforma, con 3 códigos de respaldo.",
      "El asistente del sitio se abre solo a los 2 segundos.",
    ],
  },
  {
    version: "1.4",
    date: "2026-11-03",
    title: "Documentos con membrete, firma y fecha de generación",
    changes: [
      "Presupuesto, fórmulas, documentos, consentimientos, evoluciones y recibos: membrete arriba con íconos y línea «Paciente».",
      "Al final, «Realizado por» con la firma adjunta sobre la línea y el nombre completo de quien hizo el documento.",
      "Pie con la fecha y hora en que se generó el documento.",
      "«Nombre en documentos» en Mi cuenta: por defecto «Dr(a). Nombre», editable por cada profesional.",
      "Al imprimir desde la ficha del paciente ya no se repite su encabezado de pantalla.",
      "Pagos con Wompi en producción y corrección del bloqueo al guardar logo, membrete y firma.",
      "Plataforma: fecha de corte de la suscripción fijada a mano por cliente, con motivo en la auditoría.",
    ],
  },
  {
    version: "1.3",
    date: "2026-11-01",
    title: "Invitaciones a citas por WhatsApp Web",
    changes: [
      "Motivo de la cita: primera vez, control, tratamiento o P&P.",
      "Botón «Enviar invitación por WhatsApp» al agendar: abre WhatsApp Web (wa.me) con el mensaje listo para el paciente.",
      "Mensaje editable por clínica para cada motivo, con datos de la cita, el profesional y la sede, y vista previa.",
      "Edición de sedes (nombre, dirección, ciudad y teléfono).",
    ],
  },
  {
    version: "1.2",
    date: "2026-10-27",
    title: "Pago de la suscripción con Mercado Pago",
    changes: [
      "Las clínicas pueden pagar su suscripción con Mercado Pago (Checkout Pro), además de Wompi y ePayco.",
      "Confirmación por webhook firmado y consulta directa del pago a Mercado Pago.",
    ],
  },
  {
    version: "1.1",
    date: "2026-10-21",
    title: "Migración de datos desde otros programas",
    changes: [
      "Importación de pacientes desde Excel o CSV, con asignación de columnas, validación previa y reimportación sin duplicados.",
      "Historia clínica del programa anterior: registros de solo lectura con huella de integridad y anulación por lote.",
      "Importación masiva de documentos (PDF, radiografías, fotos) por número de documento.",
      "Verificación del webhook de WhatsApp antes de activar los envíos.",
      "Versión visible en el logo e historial de versiones para la plataforma.",
    ],
  },
  {
    version: "1.0",
    date: "2026-10-19",
    title: "Despliegue en AWS",
    changes: [
      "Sitio público y aplicación en dominios separados.",
      "Ajustes de despliegue y documentación de entornos (desarrollo, test, producción).",
    ],
  },
  {
    version: "0.9",
    date: "2026-10-16",
    title: "Bioseguridad, administración y periodontograma",
    changes: [
      "Consentimientos informados con firma.",
      "Periodontograma.",
      "Bioseguridad: esterilización, limpieza, residuos, temperatura, mantenimientos y accidentes.",
      "Recaudos, financiamiento, gastos, inventario de equipos y catálogo de tratamientos.",
    ],
  },
  {
    version: "0.8",
    date: "2026-10-12",
    title: "CUPS, odontograma y política de datos",
    changes: [
      "Buscador del catálogo CUPS y odontograma con dientes ilustrados.",
      "Agenda por turnos y encabezado de historias clínicas.",
      "Política de tratamiento de datos y resiliencia de la API.",
    ],
  },
  {
    version: "0.7",
    date: "2026-10-10",
    title: "Rediseño y comunicación con clientes",
    changes: [
      "Nueva interfaz clara y sitio público renovado.",
      "Asistente (chatbot) del sitio.",
      "Avisos de plataforma a clientes con campanita de notificaciones.",
    ],
  },
  {
    version: "0.6",
    date: "2026-10-09",
    title: "Panel de plataforma y pagos",
    changes: [
      "Panel de plataforma: clientes, planes, módulos y suscripciones automáticas.",
      "Pasarelas Wompi y ePayco; sesiones revocables.",
      "Exportación PDF/JSON de historias e impresión con auditoría.",
    ],
  },
  {
    version: "0.5",
    date: "2026-10-08",
    title: "Inventario, reportes, WhatsApp y sitio público",
    changes: [
      "Inventario por sede, reportes de recaudo y producción.",
      "Recordatorios por WhatsApp y bandeja de respuestas.",
      "Sitio público y preparación para producción.",
    ],
  },
  {
    version: "0.4",
    date: "2026-10-07",
    title: "Tratamientos, caja y facturación",
    changes: ["Presupuestos, planes de tratamiento, caja y recibos.", "Borradores de factura electrónica y RIPS."],
  },
  {
    version: "0.3",
    date: "2026-10-06",
    title: "Historia clínica",
    changes: ["Antecedentes, evoluciones firmadas e inmutables, notas aclaratorias y odontograma."],
  },
  {
    version: "0.2",
    date: "2026-10-06",
    title: "Agenda",
    changes: ["Agenda de citas por profesional y sede."],
  },
  {
    version: "0.1",
    date: "2026-10-06",
    title: "Base",
    changes: ["Clínicas, usuarios y roles; aislamiento por clínica en la base de datos; pacientes con auditoría."],
  },
];

export const APP_VERSION = VERSIONS[0].version;

export type AppEnv = "development" | "test" | "production";

/**
 * Entorno de esta compilación. Se fija al construir la imagen (NEXT_PUBLIC_OCCLUS_ENV); en `next dev`
 * sin la variable se asume desarrollo.
 */
export const APP_ENV: AppEnv = ((): AppEnv => {
  const value = process.env.NEXT_PUBLIC_OCCLUS_ENV;
  if (value === "development" || value === "test" || value === "production") return value;
  return process.env.NODE_ENV === "production" ? "production" : "development";
})();

/** Desarrollo muestra el entorno y la versión; test y producción, solo la versión. */
export const VERSION_LABEL = APP_ENV === "development" ? `Desarrollo v${APP_VERSION}` : `v${APP_VERSION}`;
