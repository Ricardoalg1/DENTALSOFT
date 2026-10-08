import type { TreatmentPlan } from "./types";

export const INVOICE_STATUSES = { DRAFT: "Borrador", PREPARED: "Preparado", CANCELLED: "Cancelado" } as const;
export type InvoiceStatus = keyof typeof INVOICE_STATUSES;
export type Issuer = { legalName: string; nit: string; providerCode: string; address: string; municipality: string; email: string };
export type RipsUser = { userType: string; countryResidence: string; countryOrigin: string; municipality: string | null; zone: string | null; incapacity: string; siras: string | null };
export type ServiceRips = {
  clinicalNoteId: string; cupsCode: string; kind: "CONSULTATION" | "PROCEDURE";
  modality: string; group: string; serviceCode: number; purpose: string;
  entryRoute: string | null; cause: string | null; authorization: string | null; mipres: string | null;
  collectionConcept: string; moderatingPayment: number; moderatingInvoice: string | null; vida: string | null;
};
export type InvoiceLine = {
  sourceItemId: string; description: string; cupsCode: string | null; quantity: number;
  unitPrice: number; discount: number; total: number; rips: ServiceRips | null;
  attendedAt: string | null; diagnosisMain: string | null; diagnosisType: string | null; diagnosesRelated: string[];
};
export type InvoiceSnapshot = {
  issuer: Issuer | null;
  buyer: { documentType: string; documentNumber: string; name: string; email: string | null; address: string | null };
  patientName: string; documentType: string; documentNumber: string; birthDate: string; sex: string;
  user: RipsUser | null; lines: InvoiceLine[];
};
export type BillingValidation = { dataReady: boolean; errors: string[]; warnings: string[] };
export type Invoice = {
  id: string; draftNumber: number; patientId: string; planId: string; status: InvoiceStatus;
  total: number; createdAt: string; preparedAt: string | null; cancelledAt: string | null; cancelReason: string | null;
  snapshot: InvoiceSnapshot; validation: BillingValidation;
};
export type InvoiceSummary = Pick<Invoice, "id" | "draftNumber" | "patientId" | "status" | "total" | "createdAt"> & { patientName: string };
export type RipsPreview = { standard: string; draft: boolean; validation: BillingValidation; payload: Record<string, unknown> };
export type NoteOption = { id: string; attendedAt: string; diagnosisMain: string };
export type ProviderStatus = { configured: boolean; name: string; message: string };
export type BillablePlan = TreatmentPlan;
