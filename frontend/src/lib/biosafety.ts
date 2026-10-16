import type { Ref } from "@/lib/types";

/**
 * Registros de bioseguridad. Misma especificación de campos que BiosafetyKind.java (el backend valida y descarta
 * lo que no esté aquí).
 */
export type FieldType = "TEXT" | "NUMBER" | "DATE" | "BOOL" | "CHOICE";
export type BiosafetyField = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  min?: number;
  max?: number;
  step?: string;
  maxLength?: number;
  unit?: string;
  options?: Record<string, string>;
  /** Ocupa todo el ancho del formulario. */
  wide?: boolean;
};

export const RESULT = { PASS: "Conforme", FAIL: "No conforme" } as const;

export const BIOSAFETY_KINDS = {
  STERILIZATION: {
    slug: "esterilizacion",
    label: "Esterilización",
    description: "Ciclos de autoclave con indicadores químicos y biológicos.",
    fields: [
      { name: "equipment", label: "Equipo", type: "TEXT", required: true, maxLength: 100 },
      { name: "cycleNumber", label: "N.º de ciclo", type: "TEXT", required: true, maxLength: 30 },
      { name: "temperature", label: "Temperatura", type: "NUMBER", min: 0, max: 200, step: "0.1", unit: "°C" },
      { name: "pressure", label: "Presión", type: "NUMBER", min: 0, max: 100, step: "0.1", unit: "psi" },
      { name: "durationMin", label: "Duración", type: "NUMBER", min: 1, max: 300, unit: "min" },
      { name: "chemicalIndicator", label: "Indicador químico", type: "CHOICE", required: true, options: RESULT },
      {
        name: "biologicalIndicator",
        label: "Indicador biológico",
        type: "CHOICE",
        required: true,
        options: { ...RESULT, NOT_APPLICABLE: "No aplica en este ciclo" },
      },
      { name: "load", label: "Carga (instrumental esterilizado)", type: "TEXT", maxLength: 300, wide: true },
    ],
  },
  CLEANING: {
    slug: "limpieza",
    label: "Limpieza y desinfección",
    description: "Limpieza rutinaria y terminal de áreas, con el producto usado.",
    fields: [
      {
        name: "area",
        label: "Área",
        type: "CHOICE",
        required: true,
        options: {
          OPERATORY: "Consultorio",
          WAITING: "Sala de espera",
          RESTROOM: "Baños",
          STERILIZATION: "Esterilización",
          LAB: "Laboratorio",
          OTHER: "Otra",
        },
      },
      { name: "cleaningType", label: "Tipo", type: "CHOICE", required: true, options: { ROUTINE: "Rutinaria", TERMINAL: "Terminal" } },
      { name: "product", label: "Producto", type: "TEXT", required: true, maxLength: 100 },
      { name: "concentration", label: "Concentración / dilución", type: "TEXT", maxLength: 50 },
    ],
  },
  WASTE: {
    slug: "residuos",
    label: "Residuos (RH1)",
    description: "Generación y entrega de residuos por tipo (formulario RH1, PGIRHS).",
    fields: [
      {
        name: "wasteType",
        label: "Tipo de residuo",
        type: "CHOICE",
        required: true,
        options: {
          BIOSANITARY: "Biosanitarios",
          SHARPS: "Cortopunzantes",
          ANATOMOPATHOLOGICAL: "Anatomopatológicos",
          CHEMICAL: "Químicos",
          AMALGAM: "Amalgama / mercurio",
          RECYCLABLE: "Reciclables",
          ORDINARY: "Ordinarios",
        },
      },
      { name: "weightKg", label: "Peso", type: "NUMBER", required: true, min: 0.001, max: 10000, step: "0.001", unit: "kg" },
      { name: "collector", label: "Gestor externo", type: "TEXT", maxLength: 150 },
      { name: "certificate", label: "N.º de certificado / manifiesto", type: "TEXT", maxLength: 60 },
    ],
  },
  ENVIRONMENT: {
    slug: "temperatura",
    label: "Temperatura y humedad",
    description: "Control de nevera (2–8 °C) y condiciones ambientales.",
    fields: [
      {
        name: "place",
        label: "Lugar",
        type: "CHOICE",
        required: true,
        options: { REFRIGERATOR: "Nevera", ROOM: "Ambiente", STERILIZATION: "Área de esterilización" },
      },
      { name: "temperature", label: "Temperatura", type: "NUMBER", required: true, min: -30, max: 60, step: "0.1", unit: "°C" },
      { name: "humidity", label: "Humedad relativa", type: "NUMBER", min: 0, max: 100, step: "0.1", unit: "%" },
    ],
  },
  MAINTENANCE: {
    slug: "mantenimiento",
    label: "Mantenimiento de equipos",
    description: "Mantenimientos preventivos, correctivos y calibraciones, con su próximo vencimiento.",
    fields: [
      { name: "equipment", label: "Equipo", type: "TEXT", required: true, maxLength: 100 },
      {
        name: "maintenanceType",
        label: "Tipo",
        type: "CHOICE",
        required: true,
        options: { PREVENTIVE: "Preventivo", CORRECTIVE: "Correctivo", CALIBRATION: "Calibración" },
      },
      { name: "provider", label: "Proveedor / técnico", type: "TEXT", maxLength: 150 },
      { name: "nextDue", label: "Próximo mantenimiento", type: "DATE" },
      { name: "cost", label: "Costo", type: "NUMBER", min: 0, max: 9_999_999_999, step: "0.01", unit: "$" },
    ],
  },
  ACCIDENT: {
    slug: "accidentes",
    label: "Accidentes con riesgo biológico",
    description: "Pinchazos, cortes y salpicaduras: qué pasó, qué se hizo y si se reportó a la ARL.",
    fields: [
      { name: "affectedPerson", label: "Persona afectada", type: "TEXT", required: true, maxLength: 150 },
      {
        name: "exposureType",
        label: "Tipo de exposición",
        type: "CHOICE",
        required: true,
        options: {
          PUNCTURE: "Pinchazo",
          CUT: "Corte",
          MUCOSA_SPLASH: "Salpicadura en mucosas",
          SKIN_SPLASH: "Salpicadura en piel",
          OTHER: "Otra",
        },
      },
      { name: "reportedToArl", label: "Reportado a la ARL", type: "BOOL", required: true },
      { name: "description", label: "Descripción del evento", type: "TEXT", required: true, maxLength: 500, wide: true },
      { name: "actions", label: "Acciones realizadas", type: "TEXT", required: true, maxLength: 500, wide: true },
    ],
  },
} as const satisfies Record<string, { slug: string; label: string; description: string; fields: readonly BiosafetyField[] }>;

export type BiosafetyKind = keyof typeof BIOSAFETY_KINDS;

export const kindBySlug = (slug: string) =>
  (Object.keys(BIOSAFETY_KINDS) as BiosafetyKind[]).find((k) => BIOSAFETY_KINDS[k].slug === slug);

export type BiosafetyRecord = {
  id: string;
  site: Ref;
  kind: BiosafetyKind;
  recordDate: string;
  responsible: Ref | null;
  data: Record<string, string | number | boolean>;
  notes: string | null;
  createdBy: Ref | null;
  createdAt: string;
  voidedAt: string | null;
  voidedBy: Ref | null;
  voidReason: string | null;
  alert: string | null;
};

export type BiosafetySummary = {
  counts: { kind: BiosafetyKind; last30Days: number; lastRecord: string | null }[];
  alerts: BiosafetyRecord[];
  maintenanceDue: { equipment: string; site: Ref; nextDue: string; overdue: boolean }[];
};

/** Valor legible de un campo (opción, sí/no, número con unidad). */
export function displayValue(field: BiosafetyField, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (field.type === "BOOL") return value ? "Sí" : "No";
  if (field.type === "CHOICE") return field.options?.[String(value)] ?? String(value);
  if (field.type === "NUMBER") {
    const n = Number(value).toLocaleString("es-CO", { maximumFractionDigits: 3 });
    return field.unit === "$" ? `$ ${n}` : field.unit ? `${n} ${field.unit}` : n;
  }
  return String(value);
}
