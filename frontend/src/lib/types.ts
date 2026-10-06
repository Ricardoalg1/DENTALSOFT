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
