/**
 * Migración desde otros programas: campos de Occlus a los que se asignan las columnas del archivo y los
 * encabezados con que suelen venir, para proponer la asignación automáticamente.
 */

export type MigrationKind = "PATIENTS" | "CLINICAL_RECORDS" | "DOCUMENTS";

export const MIGRATION_KINDS: Record<MigrationKind, string> = {
  PATIENTS: "Pacientes",
  CLINICAL_RECORDS: "Historia clínica",
  DOCUMENTS: "Documentos",
};

export type SheetData = { fileName: string | null; headers: string[]; rows: string[][]; truncated: boolean };

export type RowIssue = { row: number; message: string };
export type ImportReport = { created: number; updated: number; skipped: number; errors: RowIssue[]; warnings: RowIssue[] };

export type MigrationBatch = {
  id: string;
  kind: MigrationKind;
  sourceSystem: string;
  fileName: string | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  voidedAt: string | null;
  voidReason: string | null;
};

export type LegacyRecord = {
  id: string;
  sourceSystem: string;
  attendedAt: string;
  dateOnly: boolean;
  recordType: string | null;
  professionalName: string | null;
  reason: string | null;
  diagnosisCode: string | null;
  diagnosisDescription: string | null;
  description: string | null;
  procedures: string | null;
  plan: string | null;
  importedAt: string;
  importedBy: { id: string; name: string } | null;
  integrityOk: boolean;
};

export type DocumentImportResult = {
  status: "CREATED" | "DUPLICATE" | "PATIENT_NOT_FOUND" | "INVALID";
  patient: { id: string; name: string } | null;
  message: string | null;
};

/** Programas que suelen usar las clínicas en Colombia (solo sugerencias: el campo es libre). */
export const SOURCE_SUGGESTIONS = [
  "Dentalink",
  "DT Dental",
  "Odontosoft",
  "Dentidesk",
  "Clinic Cloud",
  "Historia en Excel",
  "Otro programa",
];

/** Partes por petición (el backend acepta hasta 500 filas). */
export const CHUNK_SIZE = 500;

export type FieldDef = {
  key: string;
  label: string;
  group: string;
  /** Encabezados habituales (se comparan en minúsculas y sin tildes). */
  synonyms: string[];
};

const DOCUMENT_FIELDS: FieldDef[] = [
  {
    key: "documentType",
    label: "Tipo de documento",
    group: "Identificación",
    synonyms: ["tipo documento", "tipo de documento", "tipo doc", "tipo identificacion", "tipo de identificacion", "tipo id", "tipoid", "td"],
  },
  {
    key: "documentNumber",
    label: "Número de documento",
    group: "Identificación",
    synonyms: [
      "documento", "numero documento", "numero de documento", "no documento", "nro documento", "num documento",
      "cedula", "identificacion", "numero identificacion", "numero de identificacion", "num doc", "doc",
      "documento paciente", "dni", "cc", "id paciente",
    ],
  },
];

export const PATIENT_FIELDS: FieldDef[] = [
  ...DOCUMENT_FIELDS,
  {
    key: "fullName",
    label: "Nombre completo (en una columna)",
    group: "Nombre",
    synonyms: ["nombre completo", "paciente", "nombre paciente", "nombre del paciente", "nombres y apellidos", "apellidos y nombres", "nombre"],
  },
  { key: "givenNames", label: "Nombres (ambos)", group: "Nombre", synonyms: ["nombres"] },
  { key: "surnames", label: "Apellidos (ambos)", group: "Nombre", synonyms: ["apellidos"] },
  { key: "firstName", label: "Primer nombre", group: "Nombre", synonyms: ["primer nombre", "nombre 1", "nombre1"] },
  { key: "middleName", label: "Segundo nombre", group: "Nombre", synonyms: ["segundo nombre", "otros nombres", "nombre 2", "nombre2"] },
  { key: "firstLastName", label: "Primer apellido", group: "Nombre", synonyms: ["primer apellido", "apellido 1", "apellido1", "apellido paterno", "apellido"] },
  { key: "secondLastName", label: "Segundo apellido", group: "Nombre", synonyms: ["segundo apellido", "apellido 2", "apellido2", "apellido materno"] },
  {
    key: "birthDate",
    label: "Fecha de nacimiento",
    group: "Datos básicos",
    synonyms: ["fecha nacimiento", "fecha de nacimiento", "nacimiento", "f nacimiento", "fec nac", "fecha nac", "fechanacimiento", "cumpleanos"],
  },
  { key: "sex", label: "Sexo", group: "Datos básicos", synonyms: ["sexo", "genero", "sexo biologico"] },
  {
    key: "phone",
    label: "Teléfono",
    group: "Contacto",
    synonyms: ["telefono", "celular", "movil", "telefono celular", "tel", "whatsapp", "telefono 1", "contacto", "telefonos"],
  },
  { key: "email", label: "Correo", group: "Contacto", synonyms: ["correo", "email", "e mail", "correo electronico", "mail"] },
  { key: "address", label: "Dirección", group: "Contacto", synonyms: ["direccion", "direccion residencia", "domicilio"] },
  { key: "municipality", label: "Municipio", group: "Contacto", synonyms: ["municipio", "ciudad", "municipio residencia", "ciudad residencia"] },
  { key: "residenceZone", label: "Zona (urbana/rural)", group: "Contacto", synonyms: ["zona", "zona residencia", "zona territorial"] },
  {
    key: "regime",
    label: "Régimen",
    group: "Afiliación",
    synonyms: ["regimen", "tipo usuario", "tipo de usuario", "tipo afiliacion", "afiliacion", "regimen de afiliacion"],
  },
  {
    key: "insurer",
    label: "Aseguradora (EPS)",
    group: "Afiliación",
    synonyms: ["eps", "aseguradora", "entidad", "eapb", "convenio", "prepagada", "administradora", "empresa"],
  },
  { key: "occupation", label: "Ocupación", group: "Afiliación", synonyms: ["ocupacion", "profesion", "oficio"] },
  {
    key: "guardianName",
    label: "Acudiente",
    group: "Acudiente",
    synonyms: ["acudiente", "responsable", "nombre acudiente", "nombre responsable", "tutor", "padre o madre"],
  },
  { key: "guardianPhone", label: "Teléfono del acudiente", group: "Acudiente", synonyms: ["telefono acudiente", "telefono responsable", "celular acudiente"] },
  { key: "guardianRelationship", label: "Parentesco", group: "Acudiente", synonyms: ["parentesco", "parentesco acudiente", "relacion"] },
  { key: "notes", label: "Notas administrativas", group: "Otros", synonyms: ["notas", "comentarios", "nota", "observaciones paciente"] },
  { key: "allergies", label: "Alergias", group: "Antecedentes (historia clínica)", synonyms: ["alergias", "alergico a", "alergia"] },
  { key: "medications", label: "Medicamentos", group: "Antecedentes (historia clínica)", synonyms: ["medicamentos", "medicacion", "medicamentos actuales"] },
  {
    key: "surgicalHistory",
    label: "Quirúrgicos / hospitalizaciones",
    group: "Antecedentes (historia clínica)",
    synonyms: ["antecedentes quirurgicos", "cirugias", "quirurgicos", "hospitalizaciones"],
  },
  { key: "familyHistory", label: "Antecedentes familiares", group: "Antecedentes (historia clínica)", synonyms: ["antecedentes familiares", "familiares"] },
  {
    key: "clinicalObservations",
    label: "Antecedentes médicos / observaciones",
    group: "Antecedentes (historia clínica)",
    synonyms: ["antecedentes", "antecedentes medicos", "antecedentes personales", "enfermedades", "observaciones", "anamnesis", "patologicos"],
  },
];

export const CLINICAL_FIELDS: FieldDef[] = [
  ...DOCUMENT_FIELDS,
  {
    key: "attendedAt",
    label: "Fecha de atención",
    group: "Atención",
    synonyms: ["fecha", "fecha atencion", "fecha de atencion", "fecha consulta", "fecha cita", "fecha evolucion", "fecha registro", "fecha hora"],
  },
  {
    key: "professional",
    label: "Profesional",
    group: "Atención",
    synonyms: ["profesional", "odontologo", "doctor", "especialista", "atendido por", "medico", "dr", "odontologa"],
  },
  {
    key: "recordType",
    label: "Tipo de registro",
    group: "Atención",
    synonyms: ["tipo", "tipo registro", "tipo de registro", "tipo atencion", "servicio", "especialidad"],
  },
  { key: "reason", label: "Motivo de consulta", group: "Contenido", synonyms: ["motivo", "motivo consulta", "motivo de consulta"] },
  {
    key: "diagnosisCode",
    label: "Diagnóstico (código CIE-10)",
    group: "Contenido",
    synonyms: ["diagnostico", "codigo diagnostico", "cie10", "cie 10", "cie", "dx", "codigo cie10", "diagnostico principal"],
  },
  {
    key: "diagnosisDescription",
    label: "Diagnóstico (descripción)",
    group: "Contenido",
    synonyms: ["descripcion diagnostico", "nombre diagnostico", "diagnostico descripcion"],
  },
  {
    key: "description",
    label: "Evolución / descripción",
    group: "Contenido",
    synonyms: ["evolucion", "descripcion", "nota", "notas", "observaciones", "detalle", "nota clinica", "historia", "anotacion", "evolucion clinica"],
  },
  {
    key: "procedures",
    label: "Procedimientos",
    group: "Contenido",
    synonyms: ["procedimientos", "procedimiento", "tratamiento realizado", "tratamiento", "actividad", "procedimiento realizado"],
  },
  {
    key: "plan",
    label: "Plan / indicaciones",
    group: "Contenido",
    synonyms: ["plan", "plan de tratamiento", "indicaciones", "recomendaciones", "proximo control"],
  },
];

/** "Fecha de Nacimiento:" → "fecha de nacimiento". */
export function normalizeHeader(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[._:#°º()\-/*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Propone a qué campo va cada columna: primero coincidencias exactas con los sinónimos, después
 * encabezados que contienen un sinónimo (el más largo gana). Un campo se asigna a una sola columna.
 */
export function guessMapping(headers: string[], fields: FieldDef[]): string[] {
  const normalized = headers.map(normalizeHeader);
  const mapping = headers.map(() => "");
  const used = new Set<string>();
  normalized.forEach((h, i) => {
    const field = fields.find((f) => !used.has(f.key) && f.synonyms.includes(h));
    if (field) {
      mapping[i] = field.key;
      used.add(field.key);
    }
  });
  normalized.forEach((h, i) => {
    if (mapping[i]) return;
    let best: { key: string; length: number } | null = null;
    for (const f of fields) {
      if (used.has(f.key)) continue;
      for (const s of f.synonyms) {
        if (s.length >= 4 && h.includes(s) && (!best || s.length > best.length)) best = { key: f.key, length: s.length };
      }
    }
    if (best) {
      mapping[i] = best.key;
      used.add(best.key);
    }
  });
  // "Nombre" + "Apellidos" en columnas separadas: "Nombre" son los nombres, no el nombre completo.
  const full = mapping.indexOf("fullName");
  if (full >= 0 && (mapping.includes("surnames") || mapping.includes("firstLastName")) && !mapping.includes("givenNames")) {
    mapping[full] = "givenNames";
  }
  return mapping;
}

/** Qué falta asignar para poder importar. */
export function missingPatientFields(mapped: Set<string>): string[] {
  const missing: string[] = [];
  if (!mapped.has("documentNumber")) missing.push("Número de documento");
  const hasGiven = mapped.has("fullName") || mapped.has("givenNames") || mapped.has("firstName");
  const hasSurname = mapped.has("fullName") || mapped.has("surnames") || mapped.has("firstLastName");
  if (!hasGiven || !hasSurname) missing.push("Nombre y apellido (nombre completo o columnas separadas)");
  if (!mapped.has("birthDate")) missing.push("Fecha de nacimiento");
  if (!mapped.has("sex")) missing.push("Sexo");
  return missing;
}

export function missingClinicalFields(mapped: Set<string>): string[] {
  const missing: string[] = [];
  if (!mapped.has("documentNumber")) missing.push("Número de documento del paciente");
  if (!mapped.has("attendedAt")) missing.push("Fecha de atención");
  if (!["reason", "diagnosisCode", "diagnosisDescription", "description", "procedures", "plan"].some((k) => mapped.has(k)))
    missing.push("Al menos un campo de contenido (motivo, diagnóstico, evolución, procedimientos o plan)");
  return missing;
}

/** Plantillas CSV para quien arma el archivo a mano. */
export const PATIENT_TEMPLATE = {
  headers: [
    "Tipo de documento", "Número de documento", "Primer nombre", "Segundo nombre", "Primer apellido", "Segundo apellido",
    "Fecha de nacimiento", "Sexo", "Teléfono", "Correo", "Dirección", "Municipio", "Régimen", "EPS", "Ocupación",
    "Acudiente", "Teléfono acudiente", "Parentesco", "Alergias", "Medicamentos", "Antecedentes",
  ],
  example: [
    "CC", "1020345678", "Juan", "Carlos", "Pérez", "Gómez", "15/03/1990", "Masculino", "3001234567", "juan@correo.com",
    "Calle 10 # 20-30", "Bogotá", "Contributivo", "Sanitas", "Docente", "", "", "", "Penicilina", "", "Hipertensión controlada",
  ],
};

export const CLINICAL_TEMPLATE = {
  headers: [
    "Tipo de documento", "Número de documento", "Fecha de atención", "Profesional", "Tipo de registro", "Motivo de consulta",
    "Diagnóstico CIE-10", "Descripción diagnóstico", "Evolución", "Procedimientos", "Plan",
  ],
  example: [
    "CC", "1020345678", "10/02/2021 15:30", "Dra. Laura Martínez", "Evolución", "Dolor en molar inferior izquierdo",
    "K021", "Caries de la dentina", "Se retira caries y se obtura con resina.", "Resina 36 OD", "Control en 6 meses",
  ],
};

/**
 * Número de documento a partir de la ruta del archivo: primero el nombre ("1020345678_rx.pdf",
 * "CC 1020345678.pdf"), después las carpetas ("Pacientes/1020345678/foto.jpg").
 */
export function documentFromPath(path: string): string | null {
  const parts = path.split("/").filter(Boolean);
  const file = parts.pop() ?? "";
  const candidates = [file.replace(/\.[^.]+$/, ""), ...parts.reverse()];
  for (const c of candidates) {
    const m = c.replace(/[.\s]/g, "").match(/(\d{5,15})/);
    if (m) return m[1];
  }
  return null;
}
