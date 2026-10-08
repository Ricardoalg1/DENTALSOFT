export type Role = "ADMIN" | "DENTIST" | "RECEPTION" | "ASSISTANT";

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  DENTIST: "Odontólogo",
  RECEPTION: "Recepción",
  ASSISTANT: "Auxiliar",
};

export type TokenResponse = { accessToken: string; expiresAt: string };

export type Me = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  /** Atiende pacientes: puede escribir en la historia clínica. */
  professional: boolean;
  clinicId: string;
  clinicName: string;
};

export type User = { id: string; email: string; fullName: string; role: Role; active: boolean; professional: boolean };

export type Site = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  active: boolean;
};

// ---------- Pacientes ----------
export const DOCUMENT_TYPES = {
  CC: "Cédula de ciudadanía",
  TI: "Tarjeta de identidad",
  RC: "Registro civil",
  CE: "Cédula de extranjería",
  PA: "Pasaporte",
  PE: "Permiso especial de permanencia",
  PT: "Permiso por protección temporal",
  CN: "Certificado de nacido vivo",
  SC: "Salvoconducto",
  CD: "Carné diplomático",
  DE: "Documento extranjero",
  AS: "Adulto sin identificación",
  MS: "Menor sin identificación",
} as const;
export type DocumentType = keyof typeof DOCUMENT_TYPES;

export const SEXES = { H: "Hombre", M: "Mujer", I: "Indeterminado" } as const;
export type Sex = keyof typeof SEXES;

export const REGIMES = {
  CONTRIBUTIVO: "Contributivo",
  SUBSIDIADO: "Subsidiado",
  ESPECIAL: "Especial o de excepción",
  NO_AFILIADO: "No afiliado",
} as const;
export type Regime = keyof typeof REGIMES;

export const ZONES = { U: "Urbana", R: "Rural" } as const;
export type ResidenceZone = keyof typeof ZONES;

export type Page<T> = { content: T[]; page: number; size: number; totalElements: number; totalPages: number };

export type PatientSummary = {
  id: string;
  documentType: DocumentType;
  documentNumber: string;
  fullName: string;
  age: number;
  phone: string | null;
  regime: Regime;
  insurer: string | null;
  active: boolean;
};

export type Patient = {
  id: string;
  documentType: DocumentType;
  documentNumber: string;
  firstName: string;
  middleName: string | null;
  firstLastName: string;
  secondLastName: string | null;
  fullName: string;
  birthDate: string;
  age: number;
  sex: Sex;
  phone: string | null;
  email: string | null;
  address: string | null;
  municipality: string | null;
  residenceZone: ResidenceZone | null;
  regime: Regime;
  insurer: string | null;
  occupation: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianRelationship: string | null;
  notes: string | null;
  active: boolean;
  whatsappConsent: boolean;
  whatsappConsentAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PatientRevision = {
  revision: number;
  at: string;
  userId: string | null;
  userName: string | null;
  type: "CREATED" | "UPDATED" | "DELETED";
  changes: { field: string; before: string | null; after: string | null }[];
};

// ---------- Agenda ----------
export const APPOINTMENT_STATUS = {
  SCHEDULED: "Programada",
  CONFIRMED: "Confirmada",
  ATTENDED: "Atendida",
  NO_SHOW: "No asistió",
  CANCELLED: "Cancelada",
} as const;
export type AppointmentStatus = keyof typeof APPOINTMENT_STATUS;

export type Professional = { id: string; fullName: string };

export type Appointment = {
  id: string;
  /** ISO con offset de Colombia, p. ej. 2026-10-12T09:00:00-05:00 */
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  reason: string | null;
  notes: string | null;
  cancellationReason: string | null;
  patient: { id: string; fullName: string; documentType: DocumentType; documentNumber: string; phone: string | null };
  dentist: { id: string; name: string };
  site: { id: string; name: string };
};

export type ScheduleBlock = {
  dentistId: string;
  siteId: string;
  /** 1 = lunes … 7 = domingo */
  dayOfWeek: number;
  /** "08:00:00" */
  startTime: string;
  endTime: string;
};

export const WEEKDAYS: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
};

// ---------- Historia clínica ----------
/** Recepción no ve la historia clínica (reserva del equipo de salud). */
export const canReadClinical = (me: Me) => me.role !== "RECEPTION";
/** Escribir en la historia clínica: solo profesionales. */
export const canWriteClinical = (me: Me) => canReadClinical(me) && me.professional;

export const MEDICAL_CONDITIONS = {
  HYPERTENSION: "Hipertensión arterial",
  DIABETES: "Diabetes",
  HEART_DISEASE: "Enfermedad cardiaca",
  BLEEDING_DISORDER: "Trastorno de coagulación",
  ANTICOAGULANTS: "Toma anticoagulantes",
  HEPATITIS: "Hepatitis",
  HIV: "VIH",
  ASTHMA: "Asma u otra enfermedad respiratoria",
  EPILEPSY: "Epilepsia",
  KIDNEY_DISEASE: "Enfermedad renal",
  THYROID_DISEASE: "Enfermedad de tiroides",
  CANCER_TREATMENT: "Tratamiento oncológico (quimio/radioterapia)",
  BISPHOSPHONATES: "Toma bifosfonatos",
  PREGNANCY: "Embarazo",
  ANESTHESIA_ALLERGY: "Alergia a anestésicos locales",
} as const;
export type MedicalCondition = keyof typeof MEDICAL_CONDITIONS;

/** Se muestran como alerta en la ficha del paciente: cambian cómo se le atiende. */
export const ALERT_CONDITIONS: MedicalCondition[] = [
  "HEART_DISEASE",
  "BLEEDING_DISORDER",
  "ANTICOAGULANTS",
  "CANCER_TREATMENT",
  "BISPHOSPHONATES",
  "PREGNANCY",
  "ANESTHESIA_ALLERGY",
];

export const HABITS = {
  BRUXISM: "Bruxismo",
  SMOKING: "Tabaquismo",
  ALCOHOL: "Consumo de alcohol",
  ONYCHOPHAGIA: "Onicofagia (morderse las uñas)",
  MOUTH_BREATHING: "Respiración bucal",
  THUMB_SUCKING: "Succión digital",
  LIP_BITING: "Morderse el labio",
  OBJECT_BITING: "Morder objetos",
} as const;
export type Habit = keyof typeof HABITS;

export type Ref = { id: string; name: string };

export type ClinicalBackground = {
  conditions: MedicalCondition[];
  habits: Habit[];
  allergies: string | null;
  medications: string | null;
  surgicalHistory: string | null;
  familyHistory: string | null;
  observations: string | null;
  /** null = aún no se han registrado antecedentes */
  updatedAt: string | null;
  updatedBy: Ref | null;
};

export const DIAGNOSIS_TYPES = {
  IMPRESSION: "Impresión diagnóstica",
  CONFIRMED_NEW: "Confirmado nuevo",
  CONFIRMED_REPEAT: "Confirmado repetido",
} as const;
export type DiagnosisType = keyof typeof DIAGNOSIS_TYPES;

/** CIE-10: code como lo pide RIPS ("K021"), display para mostrar ("K02.1"). */
export type Diagnosis = { code: string; display: string; description: string };

export type ClinicalNote = {
  id: string;
  patient: Ref;
  dentist: Ref;
  appointmentId: string | null;
  attendedAt: string;
  status: "DRAFT" | "SIGNED";
  reason: string | null;
  currentIllness: string | null;
  examination: string | null;
  diagnosisMain: Diagnosis | null;
  diagnosisType: DiagnosisType | null;
  diagnosisRelated: Diagnosis[];
  procedures: string | null;
  plan: string | null;
  signedAt: string | null;
  contentHash: string | null;
  integrityOk: boolean | null;
  addenda: { id: string; author: Ref; text: string; createdAt: string }[];
  createdAt: string;
  updatedAt: string;
};

export type ClinicalNoteSummary = {
  id: string;
  patient: Ref;
  dentist: Ref;
  attendedAt: string;
  status: "DRAFT" | "SIGNED";
  reason: string | null;
  diagnosisMain: Diagnosis | null;
  signedAt: string | null;
};

// ---------- Odontograma ----------
/** O oclusal/incisal, M mesial, D distal, V vestibular, L lingual/palatino */
export type ToothSurface = "O" | "M" | "D" | "V" | "L";

export const SURFACES: Record<ToothSurface, string> = {
  O: "Oclusal / incisal",
  M: "Mesial",
  D: "Distal",
  V: "Vestibular",
  L: "Lingual / palatino",
};

type ConditionInfo = {
  label: string;
  /** true: se marca en una superficie; false: diente completo */
  surface: boolean;
  /** rojo = hallazgo por tratar; azul = tratamiento existente o realizado */
  kind: "finding" | "done" | "other";
  /** Abreviatura que se dibuja junto al diente (marcas de diente completo) */
  short?: string;
};

export const ODONTOGRAM_CONDITIONS = {
  CARIES: { label: "Caries", surface: true, kind: "finding" },
  RESIN: { label: "Resina", surface: true, kind: "done" },
  AMALGAM: { label: "Amalgama", surface: true, kind: "done" },
  SEALANT: { label: "Sellante", surface: true, kind: "done" },
  TEMPORARY_FILLING: { label: "Obturación temporal", surface: true, kind: "other" },
  FRACTURE: { label: "Fractura", surface: false, kind: "finding", short: "FX" },
  CROWN: { label: "Corona", surface: false, kind: "done" },
  ROOT_CANAL: { label: "Endodoncia realizada", surface: false, kind: "done", short: "TC" },
  ROOT_CANAL_INDICATED: { label: "Endodoncia indicada", surface: false, kind: "finding", short: "TC" },
  EXTRACTION_INDICATED: { label: "Exodoncia indicada", surface: false, kind: "finding" },
  REMNANT_ROOT: { label: "Resto radicular", surface: false, kind: "finding", short: "RR" },
  MISSING: { label: "Ausente", surface: false, kind: "done" },
  IMPLANT: { label: "Implante", surface: false, kind: "done", short: "IMP" },
  UNERUPTED: { label: "Sin erupcionar", surface: false, kind: "other", short: "SE" },
} as const satisfies Record<string, ConditionInfo>;
export type OdontogramCondition = keyof typeof ODONTOGRAM_CONDITIONS;

export type OdontogramEntry = {
  id: string;
  tooth: number;
  /** null = diente completo */
  surface: ToothSurface | null;
  condition: OdontogramCondition;
  note: string | null;
  createdAt: string;
  createdBy: Ref | null;
  removedAt: string | null;
  removedBy: Ref | null;
};

// ---------- Archivos y consentimientos ----------
export const FILE_CATEGORIES = {
  RADIOGRAPH: "Radiografía",
  PHOTO: "Fotografía",
  DOCUMENT: "Documento",
  OTHER: "Otro",
} as const;
export type FileCategory = keyof typeof FILE_CATEGORIES;

export type PatientFile = {
  id: string;
  category: FileCategory;
  title: string;
  originalFilename: string | null;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedBy: Ref | null;
};

export type ConsentTemplate = { id: string; title: string; body: string; active: boolean; updatedAt: string };

export type Consent = {
  id: string;
  patient: Ref;
  title: string;
  body: string;
  procedureDetail: string | null;
  signerName: string;
  signerDocument: string;
  signerRelationship: string;
  signatureFileId: string;
  professional: Ref | null;
  signedAt: string;
  contentHash: string;
  integrityOk: boolean;
  revokedAt: string | null;
  revokedBy: Ref | null;
  revocationReason: string | null;
};

/** Marcadores que se reemplazan al firmar un consentimiento. */
export const CONSENT_PLACEHOLDERS = ["declarante", "paciente", "documento", "profesional", "clinica", "fecha", "procedimiento"] as const;

// ---------- Tratamientos, pagos y caja ----------
export const PROCEDURE_CATEGORIES = {
  DIAGNOSIS: "Diagnóstico",
  PREVENTION: "Prevención",
  RESTORATIVE: "Operatoria",
  ENDODONTICS: "Endodoncia",
  PERIODONTICS: "Periodoncia",
  SURGERY: "Cirugía",
  PROSTHODONTICS: "Prótesis",
  ORTHODONTICS: "Ortodoncia",
  OTHER: "Otros",
} as const;
export type ProcedureCategory = keyof typeof PROCEDURE_CATEGORIES;

export type Procedure = {
  id: string;
  code: string | null;
  name: string;
  category: ProcedureCategory;
  cupsCode: string | null;
  price: number;
  perTooth: boolean;
  treatsCondition: OdontogramCondition | null;
  active: boolean;
};

export const PLAN_STATUS = {
  DRAFT: "Borrador",
  ACCEPTED: "Aceptado",
  COMPLETED: "Completado",
  REJECTED: "Rechazado",
  CANCELLED: "Cancelado",
} as const;
export type PlanStatus = keyof typeof PLAN_STATUS;

export const ITEM_STATUS = { PENDING: "Pendiente", DONE: "Realizado", CANCELLED: "Cancelado" } as const;
export type ItemStatus = keyof typeof ITEM_STATUS;

export type PlanTotals = { total: number; done: number; pending: number };

export type TreatmentItem = {
  id: string;
  procedure: Ref;
  description: string;
  cupsCode: string | null;
  tooth: number | null;
  surfaces: string | null;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  status: ItemStatus;
  doneAt: string | null;
  doneBy: Ref | null;
};

export type TreatmentPlan = {
  id: string;
  patient: Ref;
  dentist: Ref | null;
  title: string;
  status: PlanStatus;
  notes: string | null;
  validUntil: string | null;
  acceptedAt: string | null;
  acceptedBy: Ref | null;
  closedAt: string | null;
  createdAt: string;
  items: TreatmentItem[];
  totals: PlanTotals;
};

export type PlanSummary = {
  id: string;
  title: string;
  status: PlanStatus;
  dentist: Ref | null;
  createdAt: string;
  itemCount: number;
  totals: PlanTotals;
};

export type TreatmentSuggestion = {
  tooth: number;
  surfaces: string | null;
  condition: OdontogramCondition;
  procedureId: string;
  procedureName: string;
  price: number;
};

export const PAYMENT_METHODS = {
  CASH: "Efectivo",
  DEBIT_CARD: "Tarjeta débito",
  CREDIT_CARD: "Tarjeta crédito",
  TRANSFER: "Transferencia",
  OTHER: "Otro",
} as const;
export type PaymentMethod = keyof typeof PAYMENT_METHODS;

export type Payment = {
  id: string;
  receiptNumber: number;
  patient: Ref;
  patientDocument: string;
  plan: Ref | null;
  site: Ref;
  cashSessionId: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  receivedBy: Ref | null;
  receivedAt: string;
  voidedAt: string | null;
  voidedBy: Ref | null;
  voidReason: string | null;
  clinicName: string;
  clinicNit: string | null;
};

export type CashSession = {
  id: string;
  site: Ref;
  openedBy: Ref | null;
  openedAt: string;
  openingAmount: number;
  closedBy: Ref | null;
  closedAt: string | null;
  expectedCash: number;
  countedCash: number | null;
  difference: number | null;
  notes: string | null;
  totals: { method: PaymentMethod; count: number; total: number }[];
  collected: number;
  voidedCount: number;
  payments: Payment[] | null;
};

/** Saldo = realizado − pagado. Negativo: anticipo a favor del paciente. */
export type Account = { budgeted: number; done: number; pendingToDo: number; paid: number; balance: number };

/** Quién puede cobrar y ver pagos (el auxiliar no). */
export const canCollect = (me: Me) => me.role !== "ASSISTANT";
/** Quién abre y cierra caja. */
export const canManageCash = (me: Me) => me.role === "ADMIN" || me.role === "RECEPTION";

// ---------- Reportes ----------
export type Report = {
  from: string;
  to: string;
  site: Ref | null;
  revenue: {
    total: number;
    count: number;
    voidedTotal: number;
    voidedCount: number;
    byMethod: { method: PaymentMethod; count: number; total: number }[];
    byDay: { date: string; total: number }[];
    bySite: { site: Ref; total: number }[];
  };
  production: {
    total: number;
    items: number;
    byProfessional: { professional: Ref; items: number; total: number }[];
    byCategory: { category: ProcedureCategory; items: number; total: number }[];
    topProcedures: { name: string; count: number; total: number }[];
  };
  appointments: {
    total: number;
    byStatus: Record<AppointmentStatus, number>;
    attendanceRate: number | null;
    noShowRate: number | null;
    byProfessional: { professional: Ref; total: number; attended: number; noShow: number; cancelled: number }[];
  };
  patients: { newPatients: number; attended: number };
};

export type Receivables = {
  totalOwed: number;
  debtorCount: number;
  totalAdvances: number;
  debtors: {
    patientId: string;
    fullName: string;
    document: string;
    phone: string | null;
    done: number;
    paid: number;
    balance: number;
    lastPaymentAt: string | null;
  }[];
};
