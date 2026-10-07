"use server";

import { z } from "zod";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/forms";
import { ODONTOGRAM_CONDITIONS, type OdontogramCondition, type OdontogramEntry } from "@/lib/types";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const markSchema = z.object({
  tooth: z.number().int().min(11).max(85),
  surface: z.enum(["O", "M", "D", "V", "L"]).nullable(),
  condition: z.enum(Object.keys(ODONTOGRAM_CONDITIONS) as [OdontogramCondition, ...OdontogramCondition[]]),
});

/** Registra una marca. Devuelve el estado vigente de ese diente. */
export async function addMark(patientId: string, input: z.input<typeof markSchema>): Promise<ActionResult<OdontogramEntry[]>> {
  const parsed = markSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Marca inválida" };
  try {
    const data = await api<OdontogramEntry[]>(`/api/patients/${patientId}/odontogram`, {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Quita una marca (queda en el historial). Devuelve el estado vigente de ese diente. */
export async function removeMark(patientId: string, entryId: string): Promise<ActionResult<OdontogramEntry[]>> {
  if (!z.uuid().safeParse(entryId).success) return { ok: false, error: "Marca inválida" };
  try {
    const data = await api<OdontogramEntry[]>(`/api/patients/${patientId}/odontogram/${entryId}`, { method: "DELETE" });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
