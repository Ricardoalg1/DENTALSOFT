"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/forms";
import { ODONTOGRAM_CONDITIONS, PROCEDURE_CATEGORIES, type OdontogramCondition, type ProcedureCategory } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

const keys = <T extends string>(o: Record<T, unknown>) => Object.keys(o) as [T, ...T[]];

const procedureSchema = z.object({
  name: z.string().trim().min(3, "Escribe el nombre").max(150),
  code: z.string().trim().max(20).optional(),
  category: z.enum(keys<ProcedureCategory>(PROCEDURE_CATEGORIES)),
  cupsCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{0,10}$/, "CUPS: solo letras y números (hasta 10)")
    .optional(),
  price: z.number({ message: "Precio inválido" }).min(0, "El precio no puede ser negativo").max(999_999_999_999),
  perTooth: z.boolean(),
  treatsCondition: z.enum(keys<OdontogramCondition>(ODONTOGRAM_CONDITIONS)).nullable(),
  active: z.boolean(),
});

export async function saveProcedure(id: string | null, input: z.input<typeof procedureSchema>): Promise<ActionResult> {
  const parsed = procedureSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    await api(id ? `/api/procedures/${id}` : "/api/procedures", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(parsed.data),
    });
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: errorMessage(e) };
  }
  revalidatePath("/app/precios");
  return { ok: true };
}

export async function loadExampleProcedures(): Promise<ActionResult> {
  try {
    await api("/api/procedures/examples", { method: "POST" });
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: errorMessage(e) };
  }
  revalidatePath("/app/precios");
  return { ok: true };
}

const cupsImportSchema = z.object({
  price: z.number({ message: "Precio inválido" }).min(0, "El precio no puede ser negativo").max(999_999_999_999),
  items: z
    .array(
      z.object({
        cupsCode: z.string().regex(/^[A-Za-z0-9]{1,10}$/),
        name: z.string().trim().min(1).max(150),
        category: z.enum(keys<ProcedureCategory>(PROCEDURE_CATEGORIES)),
      }),
    )
    .min(1, "Elige al menos un código")
    .max(200, "Máximo 200 códigos por importación"),
});

/** Importa códigos CUPS como procedimientos; omite los que ya estén (por código o nombre). */
export async function importCupsProcedures(
  price: number,
  items: z.input<typeof cupsImportSchema>["items"],
): Promise<{ ok: true; data: { created: number; skipped: number } } | { ok: false; error: string }> {
  const parsed = cupsImportSchema.safeParse({ price, items });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    const data = await api<{ created: number; skipped: number }>("/api/procedures/import-cups", {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });
    revalidatePath("/app/precios");
    return { ok: true, data };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: errorMessage(e) };
  }
}
