import type { ModuleKey, SubscriptionStatus } from "./types";

/** Tipos, etiquetas y utilidades del panel de plataforma (sin acceso a red: se pueden usar en el cliente). */

export const MODULE_LABELS: Record<ModuleKey, string> = {
  CLINICAL_RECORD: "Historia clínica",
  TREATMENTS_CASH: "Tratamientos y caja",
  BILLING_RIPS: "Facturación y RIPS",
  INVENTORY: "Inventario",
  REPORTS: "Reportes",
  MESSAGING: "Mensajes (WhatsApp)",
};

export const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  TRIAL: "En prueba",
  ACTIVE: "Activa",
  PAST_DUE: "En mora",
  SUSPENDED: "Suspendida",
  CANCELLED: "Cancelada",
};

export const STATUS_VARIANT: Record<SubscriptionStatus, "default" | "secondary" | "destructive" | "outline"> = {
  TRIAL: "secondary",
  ACTIVE: "default",
  PAST_DUE: "destructive",
  SUSPENDED: "destructive",
  CANCELLED: "outline",
};

export const CYCLE_LABELS = { MONTHLY: "Mensual", ANNUAL: "Anual" } as const;
export const SEVERITY_LABELS = { INFO: "Info", WARNING: "Atención", CRITICAL: "Crítico" } as const;
export type Severity = keyof typeof SEVERITY_LABELS;
export const SEVERITY_VARIANT: Record<Severity, "secondary" | "outline" | "destructive"> = {
  INFO: "outline",
  WARNING: "secondary",
  CRITICAL: "destructive",
};

export const CHARGE_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  PAID: "Pagado",
  FAILED: "Fallido",
  VOID: "Anulado",
};

export const EVENT_KIND_LABELS: Record<string, string> = {
  CLINIC_CREATED: "Cliente nuevo",
  LEAD_RECEIVED: "Solicitud comercial",
  TRIAL_ENDING: "Prueba por terminar",
  TRIAL_ENDED: "Prueba terminada",
  RENEWAL_UPCOMING: "Renovación próxima",
  RENEWAL_DUE: "Renovación pendiente",
  PAYMENT_RECEIVED: "Pago recibido",
  PAYMENT_REVIEW: "Pago a revisar",
  PAYMENT_FAILED: "Cobro fallido",
  SUSPENDED: "Suspensión",
  SUBSCRIPTION_CANCELLED: "Cancelación",
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  CLINIC_CREATED: "Creó un cliente",
  CLIENT_UPDATED: "Editó datos del cliente",
  MODULES_CHANGED: "Cambió módulos",
  PLAN_CHANGED: "Cambió el plan",
  PLAN_EDITED: "Editó un plan del catálogo",
  TRIAL_EXTENDED: "Extendió la prueba",
  SUSPENDED: "Suspendió",
  REACTIVATED: "Reactivó",
  CANCELLED: "Canceló",
  CANCEL_SCHEDULED: "Programó la cancelación",
  CANCEL_UNDONE: "Deshizo la cancelación",
  PAYMENT_REGISTERED: "Registró un pago",
  PAYMENT_METHOD_SET: "Registró medio de pago",
  PAYMENT_METHOD_REMOVED: "Quitó el medio de pago",
  ENGINE_RUN: "Ejecutó el proceso de suscripciones",
  ANNOUNCEMENT_CREATED: "Publicó un aviso",
  ANNOUNCEMENT_ARCHIVED: "Archivó un aviso",
};

export type ModuleInfo = { key: ModuleKey; label: string; description: string; requires: ModuleKey[] };

export type PlanDto = {
  code: string;
  name: string;
  maxUsers: number | null;
  priceMonthly: number | null;
  priceAnnual: number | null;
  modules: ModuleKey[];
  active: boolean;
  sortOrder: number;
};

export type ClinicAlert = { clinicId: string; clinicName: string; status: string; date: string; amount: number | null };

export type EventRow = {
  id: string;
  at: string;
  clinicId: string | null;
  clinicName: string | null;
  kind: string;
  severity: Severity;
  title: string;
  detail: Record<string, unknown> | null;
};

export type Overview = {
  /** simulated | simulated+live | live | none */
  gatewayMode: string;
  checkoutProviders: string[];
  cardProviders: string[];
  schedulerEnabled: boolean;
  graceDays: number;
  clinics: { total: number; trial: number; active: number; pastDue: number; suspended: number; cancelled: number };
  mrr: number;
  arr: number;
  trialsEnding: ClinicAlert[];
  pastDue: ClinicAlert[];
  renewalsUpcoming: ClinicAlert[];
  unreadNotifications: number;
  recentEvents: EventRow[];
};

export type ClinicRow = {
  id: string;
  name: string;
  nit: string | null;
  city: string | null;
  contactName: string | null;
  contactEmail: string | null;
  planCode: string;
  planName: string;
  status: SubscriptionStatus;
  billingCycle: keyof typeof CYCLE_LABELS;
  price: number;
  modules: ModuleKey[];
  usersActive: number;
  maxUsers: number | null;
  patients: number;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  lastActivityAt: string | null;
};

export type SubscriptionView = {
  planCode: string;
  planName: string;
  status: SubscriptionStatus;
  billingCycle: keyof typeof CYCLE_LABELS;
  price: number;
  maxUsers: number | null;
  modules: ModuleKey[];
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  pastDueSince: string | null;
  suspendedAt: string | null;
  cancelledAt: string | null;
  accessUntil: string | null;
  accessAllowed: boolean;
  inGrace: boolean;
};

export type ClinicDetail = {
  id: string;
  name: string;
  nit: string | null;
  createdAt: string;
  client: {
    legalName: string | null;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    city: string | null;
    internalNotes: string | null;
    source: string;
  };
  subscription: SubscriptionView;
  paymentMethod: { provider: string; label: string } | null;
  usage: {
    usersActive: number;
    usersTotal: number;
    sites: number;
    patients: number;
    appointments30d: number;
    storageBytes: number;
    lastActivityAt: string | null;
  };
  admins: { id: string; email: string; fullName: string; active: boolean }[];
};

export type ChargeView = {
  id: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  status: string;
  method: string;
  attempts: number;
  nextAttemptAt: string | null;
  reference: string | null;
  failureReason: string | null;
  paidAt: string | null;
  createdAt: string;
};

export type AuditRow = {
  id: string;
  at: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  clinicId: string | null;
  clinicName: string | null;
  summary: string;
  details: Record<string, unknown> | null;
  requestId: string | null;
};

export type NotificationRow = { id: string; createdAt: string; readAt: string | null; event: EventRow };

export type AnnouncementRow = {
  id: string;
  clinicId: string | null;
  clinicName: string | null;
  title: string;
  body: string;
  level: string;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
  archivedAt: string | null;
};

export type ClinicAnnouncement = { id: string; title: string; body: string; level: "INFO" | "WARNING" | "CRITICAL" };

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export type CreatedClient = { clinicId: string; adminEmail: string; temporaryPassword: string };

/** Resultado de las acciones del panel: como FormState, más un mensaje y los datos de un cliente recién creado. */
export type PlatformState =
  | {
      error?: string;
      fieldErrors?: Record<string, string[] | undefined>;
      ok?: boolean;
      message?: string;
      created?: CreatedClient;
    }
  | undefined;

// ---------- Suscripción vista por la propia clínica ----------

export const PROVIDER_LABELS: Record<string, string> = { WOMPI: "Wompi", EPAYCO: "ePayco", SIMULATED: "Simulada" };

export type SubscriptionState = {
  planCode: string;
  planName: string;
  status: SubscriptionStatus;
  billingCycle: keyof typeof CYCLE_LABELS;
  price: number;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  accessAllowed: boolean;
  inactiveMessage: string | null;
  dueDate: string | null;
  canPay: boolean;
  cannotPayReason: string | null;
  checkoutProviders: string[];
  cardOnFileAvailable: boolean;
  paymentMethod: { provider: string; label: string } | null;
  charges: ChargeView[];
};

export type CheckoutStarted = {
  checkoutId: string;
  provider: string;
  redirectUrl: string | null;
  params: Record<string, string>;
};

export type CheckoutResult = { status: "CREATED" | "APPROVED" | "DECLINED"; message: string };

export type WompiSetup = {
  publicKey: string;
  apiBase: string;
  acceptanceToken: string;
  acceptancePermalink: string;
  personalAuthToken: string;
  personalAuthPermalink: string;
};

export type SessionInfo = { id: string; createdAt: string; userAgent: string | null; current: boolean };
