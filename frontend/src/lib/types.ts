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
  /** Módulos opcionales que el backend le permite usar hoy a la clínica (vacío si no tiene acceso). */
  modules: ModuleKey[];
  subscription: SubscriptionInfo | null;
  /** Entró con una contraseña temporal: no puede hacer nada hasta cambiarla. */
  mustChangePassword: boolean;
  /** Pertenece al equipo de Occlus: ve el panel de plataforma. */
  platformAdmin: boolean;
};

export type ModuleKey = "CLINICAL_RECORD" | "TREATMENTS_CASH" | "BILLING_RIPS" | "INVENTORY" | "REPORTS" | "MESSAGING";

export type SubscriptionStatus = "TRIAL" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED";

export type SubscriptionInfo = {
  status: SubscriptionStatus;
  planCode: string;
  planName: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  accessUntil: string | null;
  inGrace: boolean;
  cancelAtPeriodEnd: boolean;
  accessAllowed: boolean;
  inactiveMessage: string | null;
};

export function hasModule(me: Pick<Me, "modules">, module: ModuleKey) {
  return me.modules.includes(module);
}

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

/** Ausencia de un profesional: fechas "2026-10-12"; sin horas = todo el día. */
export type TimeOff = {
  dentistId: string;
  fromDate: string;
  toDate: string;
  startTime: string | null;
  endTime: string | null;
  reason: string;
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

/**
 * Una cara del diente (formato SEPA): 3 sitios de izquierda a derecha como se ve en el dibujo.
 * pd = profundidad de sondaje, gm = margen gingival (negativo = sobre la corona), bop = sangrado 0–3,
 * furcation = grados 0–3 en las entradas de furca de esa cara.
 */
export type PerioSide = {
  pd: (number | null)[];
  gm: (number | null)[];
  bop: number[];
  suppuration: boolean[];
  plaque: boolean[];
  furcation?: number[] | null;
};
export type PerioPrognosis = "GOOD" | "DOUBTFUL" | "POOR" | "HOPELESS";
export const PERIO_PROGNOSES: Record<PerioPrognosis, string> = {
  GOOD: "Bueno",
  DOUBTFUL: "Dudoso",
  POOR: "Malo",
  HOPELESS: "Imposible",
};
export type PerioTooth = {
  tooth: number;
  missing?: boolean | null;
  implant?: boolean | null;
  mobility?: number | null;
  prognosis?: PerioPrognosis | null;
  gingivalWidth?: number | null;
  note?: string | null;
  buccal?: PerioSide | null;
  lingual?: PerioSide | null;
};
export type PerioChart = { teeth: PerioTooth[] };
/** Periodontograma: examen periodontal propio del paciente (puede tener varios). Inmutable al firmarlo. */
export type PerioExam = {
  id: string;
  patient: Ref;
  dentist: Ref;
  examinedAt: string;
  status: "DRAFT" | "SIGNED";
  observations: string | null;
  chart: PerioChart;
  signedAt: string | null;
  contentHash: string | null;
  integrityOk: boolean | null;
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
export const CONSENT_PLACEHOLDERS = ["declarante", "paciente", "documento", "profesional", "registro_profesional", "clinica", "fecha", "procedimiento"] as const;

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
  /** Tratamiento del catálogo al que pertenece. */
  treatment: Ref | null;
};

/** Tratamiento del catálogo de la clínica: agrupa procedimientos de la lista de precios. */
export type TreatmentType = {
  id: string;
  name: string;
  category: ProcedureCategory;
  description: string | null;
  active: boolean;
  /** Procedimientos que lo usan. */
  procedures: number;
};

export type ImportResult = { created: number; updated: number; skipped: number; errors: { row: number; message: string }[] };

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
  kind: PaymentKind;
  /** Día del ingreso (YYYY-MM-DD). */
  incomeDate: string;
  dentist: Ref | null;
  payerName: string | null;
  payerDocument: string | null;
  concept: string | null;
  paymentTerm: PaymentTerm;
  items: PaymentLine[];
  financingId: string | null;
};

export const EXPENSE_CATEGORIES = {
  SUPPLIES: "Insumos y materiales",
  LAB: "Laboratorio dental",
  PAYROLL: "Nómina y honorarios",
  RENT: "Arriendo",
  UTILITIES: "Servicios públicos",
  MAINTENANCE: "Mantenimiento",
  EQUIPMENT: "Equipos",
  MARKETING: "Publicidad",
  TAXES: "Impuestos",
  BIOSAFETY: "Bioseguridad",
  OTHER: "Otros",
} as const;
export type ExpenseCategory = keyof typeof EXPENSE_CATEGORIES;

export type Expense = {
  id: string;
  site: Ref;
  cashSessionId: string | null;
  expenseDate: string;
  category: ExpenseCategory;
  description: string;
  supplierName: string | null;
  supplierDocument: string | null;
  invoiceNumber: string | null;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  createdBy: Ref | null;
  createdAt: string;
  voidedAt: string | null;
  voidedBy: Ref | null;
  voidReason: string | null;
};

export const FINANCING_FREQUENCIES = { WEEKLY: "Semanal", BIWEEKLY: "Quincenal", MONTHLY: "Mensual" } as const;
export type FinancingFrequency = keyof typeof FINANCING_FREQUENCIES;
export const FINANCING_STATUS = { ACTIVE: "Al día", OVERDUE: "En mora", PAID: "Pagado", CANCELLED: "Cancelado" } as const;
export type FinancingStatus = keyof typeof FINANCING_STATUS;
export const INSTALLMENT_STATUS = { PAID: "Pagada", PARTIAL: "Abonada", PENDING: "Pendiente", OVERDUE: "Vencida" } as const;
export type InstallmentStatus = keyof typeof INSTALLMENT_STATUS;

export type Financing = {
  id: string;
  patient: Ref;
  patientDocument: string;
  plan: Ref | null;
  concept: string;
  totalAmount: number;
  downPayment: number;
  installments: number;
  frequency: FinancingFrequency;
  firstDue: string;
  notes: string | null;
  createdBy: Ref | null;
  createdAt: string;
  cancelledAt: string | null;
  cancelledBy: Ref | null;
  cancelReason: string | null;
  paid: number;
  balance: number;
  overdue: number;
  status: FinancingStatus;
  nextDue: string | null;
  /** Cuota 0 = cuota inicial. */
  schedule: { number: number; dueDate: string; amount: number; paid: number; status: InstallmentStatus }[];
};

export const PAYMENT_KINDS = {
  SALE: "Recibo",
  ACCOUNT: "Abono a cuenta",
} as const;
export type PaymentKind = keyof typeof PAYMENT_KINDS;

export const PAYMENT_TERMS = { CASH: "Contado", CREDIT: "Crédito" } as const;
export type PaymentTerm = keyof typeof PAYMENT_TERMS;

export const DISCOUNT_TYPES = { PERCENT: "%", AMOUNT: "$" } as const;
export type DiscountType = keyof typeof DISCOUNT_TYPES;

/** Línea del detalle de un ingreso (procedimiento cobrado). */
export type PaymentLine = {
  position: number;
  procedure: Ref | null;
  description: string;
  cupsCode: string | null;
  quantity: number;
  purpose: string | null;
  unitPrice: number;
  subtotal: number;
  discountType: DiscountType | null;
  discountValue: number;
  discount: number;
  total: number;
  diagnosisMain: string | null;
  diagnosisRelated: string | null;
};

/**
 * Finalidad de la tecnología en salud (RIPS, Resolución 2275 de 2023): las de uso odontológico más frecuente.
 * Verifica la tabla de referencia vigente de SISPRO para casos especiales.
 */
export const RIPS_PURPOSES = {
  "11": "Valoración integral para la promoción y mantenimiento",
  "12": "Detección temprana de enfermedad general",
  "14": "Protección específica",
  "15": "Diagnóstico",
  "16": "Tratamiento",
  "17": "Rehabilitación",
  "18": "Paliación",
  "44": "Otra",
} as const;

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
  cashExpenses: number;
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
