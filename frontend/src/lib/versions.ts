/**
 * Versiones de Occlus (formato mayor.menor). La primera entrada es la versión actual: la muestra el logo
 * y la página de plataforma «Versiones». Al publicar cambios, agrega una entrada arriba.
 */
export type VersionEntry = { version: string; date: string; title: string; changes: string[] };

export const VERSIONS: VersionEntry[] = [
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
