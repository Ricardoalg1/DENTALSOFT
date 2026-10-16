"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/forms";
import {
  ODONTOGRAM_CONDITIONS,
  PROCEDURE_CATEGORIES,
  type ImportResult,
  type OdontogramCondition,
  type Procedure,
  type ProcedureCategory,
  type TreatmentType,
} from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };
export type DataResult<T> = { ok: true; data: T } | { ok: false; error: string };

const keys = <T extends string>(o: Record<T, unknown>) => Object.keys(o) as [T, ...T[]];
const uuid = z.uuid();

async function run<T>(fn: () => Promise<T>): Promise<DataResult<T>> {
  try {
    const data = await fn();
    revalidatePath("/app/precios");
    return { ok: true, data };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: errorMessage(e) };
  }
}

// ---------- Procedimientos ----------

const procedureSchema = z.object({
  name: z.string().trim().min(3, "Escribe el nombre").max(150),
  code: z.string().trim().max(20).optional(),
  category: z.enum(keys<ProcedureCategory>(PROCEDURE_CATEGORIES)).optional(),
  cupsCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{0,10}$/, "CUPS: solo letras y números (hasta 10)")
    .optional(),
  price: z.number({ message: "Precio inválido" }).min(0, "El precio no puede ser negativo").max(999_999_999_999),
  perTooth: z.boolean(),
  treatsCondition: z.enum(keys<OdontogramCondition>(ODONTOGRAM_CONDITIONS)).nullable(),
  active: z.boolean(),
  treatmentId: z.uuid({ message: "Elige el tratamiento" }).optional(),
});

export async function saveProcedure(id: string | null, input: z.input<typeof procedureSchema>): Promise<ActionResult> {
  const parsed = procedureSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!parsed.data.treatmentId && !parsed.data.category) return { ok: false, error: "Elige el tratamiento" };
  if (id && !uuid.safeParse(id).success) return { ok: false, error: "Procedimiento inválido" };
  const r = await run(() =>
    api<Procedure>(id ? `/api/procedures/${id}` : "/api/procedures", { method: id ? "PUT" : "POST", body: JSON.stringify(parsed.data) }),
  );
  return r.ok ? { ok: true } : r;
}

export async function setProcedureActive(id: string, active: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Procedimiento inválido" };
  const r = await run(() => api(`/api/procedures/${id}/status`, { method: "PATCH", body: JSON.stringify({ active }) }));
  return r.ok ? { ok: true } : r;
}

export async function deleteProcedure(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Procedimiento inválido" };
  const r = await run(() => api(`/api/procedures/${id}`, { method: "DELETE" }));
  return r.ok ? { ok: true } : r;
}

/** Todos los procedimientos (activos e inactivos) para exportar. */
export async function exportProcedures(): Promise<DataResult<Procedure[]>> {
  try {
    return { ok: true, data: await api<Procedure[]>("/api/procedures?includeInactive=true") };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: errorMessage(e) };
  }
}

const procedureRow = z.object({
  name: z.string().max(200),
  cupsCode: z.string().max(20).optional(),
  treatment: z.string().max(200).optional(),
  price: z.number().nullable(),
  perTooth: z.boolean().nullable(),
  active: z.boolean().nullable(),
  code: z.string().max(40).optional(),
});

export async function importProcedures(rows: z.input<typeof procedureRow>[]): Promise<DataResult<ImportResult>> {
  const parsed = z.array(procedureRow).min(1, "El archivo no tiene filas").max(2000, "Máximo 2.000 filas por archivo").safeParse(rows);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  return run(() => api<ImportResult>("/api/procedures/import", { method: "POST", body: JSON.stringify(parsed.data) }));
}

export async function loadExampleProcedures(): Promise<ActionResult> {
  const r = await run(() => api("/api/procedures/examples", { method: "POST" }));
  return r.ok ? { ok: true } : r;
}

const cupsImportSchema = z.object({
  price: z.number({ message: "Precio inválido" }).min(0, "El precio no puede ser negativo").max(999_999_999_999),
  treatmentId: z.uuid().optional(),
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
  treatmentId?: string,
): Promise<DataResult<{ created: number; skipped: number }>> {
  const parsed = cupsImportSchema.safeParse({ price, items, treatmentId: treatmentId || undefined });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  return run(() =>
    api<{ created: number; skipped: number }>("/api/procedures/import-cups", { method: "POST", body: JSON.stringify(parsed.data) }),
  );
}

// ---------- Tratamientos ----------

const treatmentSchema = z.object({
  name: z.string().trim().min(3, "Escribe el nombre").max(150),
  category: z.enum(keys<ProcedureCategory>(PROCEDURE_CATEGORIES), { message: "Elige la categoría" }),
  description: z.string().trim().max(300).transform((s) => s || undefined).optional(),
  active: z.boolean(),
});

export async function saveTreatment(id: string | null, input: z.input<typeof treatmentSchema>): Promise<DataResult<TreatmentType>> {
  const parsed = treatmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (id && !uuid.safeParse(id).success) return { ok: false, error: "Tratamiento inválido" };
  return run(() =>
    api<TreatmentType>(id ? `/api/treatment-types/${id}` : "/api/treatment-types", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(parsed.data),
    }),
  );
}

export async function setTreatmentActive(id: string, active: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Tratamiento inválido" };
  const r = await run(() => api(`/api/treatment-types/${id}/status`, { method: "PATCH", body: JSON.stringify({ active }) }));
  return r.ok ? { ok: true } : r;
}

export async function deleteTreatment(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Tratamiento inválido" };
  const r = await run(() => api(`/api/treatment-types/${id}`, { method: "DELETE" }));
  return r.ok ? { ok: true } : r;
}

export async function loadTreatmentPresets(): Promise<DataResult<ImportResult>> {
  return run(() => api<ImportResult>("/api/treatment-types/presets", { method: "POST" }));
}

export async function exportTreatments(): Promise<DataResult<TreatmentType[]>> {
  try {
    return { ok: true, data: await api<TreatmentType[]>("/api/treatment-types") };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: errorMessage(e) };
  }
}

export async function importTreatments(
  rows: { name: string; category: ProcedureCategory | null; description?: string; active: boolean | null }[],
): Promise<DataResult<ImportResult>> {
  const parsed = z
    .array(z.object({ name: z.string().max(200), category: z.enum(keys<ProcedureCategory>(PROCEDURE_CATEGORIES)).nullable(), description: z.string().max(400).optional(), active: z.boolean().nullable() }))
    .min(1, "El archivo no tiene filas")
    .max(2000, "Máximo 2.000 filas por archivo")
    .safeParse(rows);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  return run(() => api<ImportResult>("/api/treatment-types/import", { method: "POST", body: JSON.stringify(parsed.data) }));
}
