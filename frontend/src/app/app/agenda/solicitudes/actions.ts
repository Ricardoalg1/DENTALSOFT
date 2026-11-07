"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/forms";

export type InboxResult = { ok: true } | { ok: false; error: string };

async function run(fn: () => Promise<unknown>): Promise<InboxResult> {
  try {
    await fn();
    revalidatePath("/app/agenda/solicitudes");
    revalidatePath("/app/agenda");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function confirmRequest(id: string, patientId: string): Promise<InboxResult> {
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(patientId).success) return { ok: false, error: "Elige un paciente." };
  return run(() => api(`/api/online-booking/requests/${id}/confirm`, { method: "POST", body: JSON.stringify({ patientId }) }));
}

export async function rejectRequest(id: string, reason: string): Promise<InboxResult> {
  const clean = z.string().trim().max(200).safeParse(reason);
  if (!z.uuid().safeParse(id).success || !clean.success) return { ok: false, error: "El motivo admite máximo 200 caracteres." };
  return run(() => api(`/api/online-booking/requests/${id}/reject`, { method: "POST", body: JSON.stringify({ reason: clean.data || null }) }));
}
