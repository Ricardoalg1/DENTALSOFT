"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { api } from "@/lib/api";
import { BIOSAFETY_KINDS, type BiosafetyKind, type BiosafetyRecord } from "@/lib/biosafety";
import { errorMessage } from "@/lib/forms";

export type BiosafetyResult<T> = { ok: true; data: T } | { ok: false; error: string };

const recordSchema = z.object({
  siteId: z.uuid({ message: "Elige la sede" }),
  kind: z.enum(Object.keys(BIOSAFETY_KINDS) as [BiosafetyKind, ...BiosafetyKind[]]),
  recordDate: z.iso.date({ message: "Fecha inválida" }),
  data: z.record(z.string(), z.union([z.string().max(500), z.number(), z.boolean()])),
  notes: z.string().trim().max(500).transform((s) => s || undefined).optional(),
});

export async function registerRecord(input: z.input<typeof recordSchema>): Promise<BiosafetyResult<BiosafetyRecord>> {
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    const data = await api<BiosafetyRecord>("/api/biosafety", { method: "POST", body: JSON.stringify(parsed.data) });
    revalidatePath("/app/bioseguridad", "layout");
    return { ok: true, data };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: errorMessage(e) };
  }
}

export async function voidRecord(id: string, reason: string): Promise<BiosafetyResult<BiosafetyRecord>> {
  const parsed = z.object({ reason: z.string().trim().min(3, "Escribe el motivo").max(300) }).safeParse({ reason });
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Registro inválido" };
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    const data = await api<BiosafetyRecord>(`/api/biosafety/${id}/void`, { method: "POST", body: JSON.stringify(parsed.data) });
    revalidatePath("/app/bioseguridad", "layout");
    return { ok: true, data };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: errorMessage(e) };
  }
}
