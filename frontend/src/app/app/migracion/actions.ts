"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/forms";

export type ActionResult = { ok: true } | { ok: false; error: string };

const voidSchema = z.object({
  batchId: z.uuid(),
  reason: z.string().trim().min(5, "Explica el motivo (mínimo 5 caracteres)").max(300),
});

/** Anula un lote de historia clínica importado por error (los registros se ocultan, no se borran). */
export async function voidBatch(batchId: string, reason: string): Promise<ActionResult> {
  const parsed = voidSchema.safeParse({ batchId, reason });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    await api(`/api/migration/batches/${parsed.data.batchId}/void`, {
      method: "POST",
      body: JSON.stringify({ reason: parsed.data.reason }),
    });
    revalidatePath("/app/migracion");
    return { ok: true };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: errorMessage(e) };
  }
}
