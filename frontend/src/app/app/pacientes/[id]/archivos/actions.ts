"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/forms";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Oculta un archivo (sigue guardado para auditoría). */
export async function removeFile(patientId: string, fileId: string, reason: string): Promise<ActionResult> {
  const parsed = z.object({ fileId: z.uuid(), reason: z.string().trim().min(3, "Indica el motivo").max(200) }).safeParse({
    fileId,
    reason,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    await api(`/api/files/${fileId}/remove`, { method: "POST", body: JSON.stringify({ reason: parsed.data.reason }) });
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
  revalidatePath(`/app/pacientes/${patientId}/archivos`);
  return { ok: true };
}
