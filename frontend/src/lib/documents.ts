export type DocumentBranding = { name: string; nit: string | null; address: string; phone: string; email: string; logoId: string | null };
export type DocumentProfile = { name: string; registration: string; signatureId: string | null };
export type Medicine = { name: string; concentration: string; presentation: string; dose: string; route: string; frequency: string; duration: string; quantity: string; instructions: string };
export type Prescription = { id: string; patientId: string; authorId: string; author: string; content: { medicines: Medicine[]; recommendations: string; diagnosis: string }; snapshot: { clinic: DocumentBranding; patient: string; identification: string; birthDate: string; professional: string; registration: string; signatureId: string | null } | null; signedAt: string | null; hash: string | null; createdAt: string; integrityOk: boolean };

export type IssuedKind = "DISABILITY" | "REFERRAL" | "ORDER" | "CERTIFICATE";
export const ISSUED_KINDS: Record<IssuedKind, { label: string; description: string }> = {
  DISABILITY: { label: "Incapacidad", description: "Constancia de incapacidad por días, con diagnóstico y recomendaciones." },
  REFERRAL: { label: "Remisión", description: "Remite al paciente a otra especialidad o servicio con un resumen clínico." },
  ORDER: { label: "Orden", description: "Orden de radiografías, laboratorio u otros exámenes." },
  CERTIFICATE: { label: "Constancia", description: "Constancia de asistencia o de atención odontológica." },
};
export type IssuedSummary = { id: string; kind: IssuedKind; title: string; issuedAt: string; professional: string };
export type IssuedDocument = {
  id: string;
  patientId: string;
  kind: IssuedKind;
  title: string;
  body: string;
  issuedAt: string;
  professional: string;
  registration: string;
  signatureId: string | null;
  patient: string;
  identification: string;
  birthDate: string;
  clinic: DocumentBranding;
  hash: string;
  integrityOk: boolean;
};
