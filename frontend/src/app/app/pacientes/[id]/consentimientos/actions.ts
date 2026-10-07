"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/forms";
import type { Consent } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

const signSchema = z.object({
  templateId: z.uuid("Selecciona una plantilla"),
  procedureDetail: z.string().trim().max(1000).optional(),
  signerName: z.string().trim().min(3, "Nombre de quien firma").max(150),
  signerDocument: z.string().trim().min(3, "Documento de quien firma").max(30),
  signerRelationship: z.string().trim().min(3, "Parentesco de quien firma").max(40),
  signaturePng: z
    .string()
    .startsWith("data:image/png;base64,", "Falta la firma")
    .max(700_000, "La firma es demasiado grande"),
});

export async function signConsent(patientId: string, input: z.input<typeof signSchema>): Promise<ActionResult> {
  const parsed = signSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  let consent: Consent;
  try {
    consent = await api<Consent>(`/api/patients/${patientId}/consents`, {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
  redirect(`/app/pacientes/${patientId}/consentimientos/${consent.id}`);
}

export async function revokeConsent(patientId: string, consentId: string, reason: string): Promise<ActionResult> {
  const parsed = z.string().trim().min(3, "Indica el motivo de la revocación").max(500).safeParse(reason);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    await api(`/api/consents/${consentId}/revoke`, { method: "POST", body: JSON.stringify({ reason: parsed.data }) });
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
  revalidatePath(`/app/pacientes/${patientId}/consentimientos`, "layout");
  return { ok: true };
}
