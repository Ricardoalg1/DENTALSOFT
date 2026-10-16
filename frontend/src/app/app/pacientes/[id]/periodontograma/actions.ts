"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/forms";
import type { PerioExam } from "@/lib/types";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

const perioSite = <T extends z.ZodType>(item: T) => z.array(item).length(3);
const perioSide = z.object({
  pd: perioSite(z.number().int().min(0).max(15).nullable()),
  gm: perioSite(z.number().int().min(-10).max(15).nullable()),
  bop: perioSite(z.number().int().min(0).max(3)),
  suppuration: perioSite(z.boolean()),
  plaque: perioSite(z.boolean()),
  furcation: z.array(z.number().int().min(0).max(3)).max(2).nullish(),
});
const perioTooth = z.object({
  tooth: z.number().int(),
  missing: z.boolean().nullish(),
  implant: z.boolean().nullish(),
  mobility: z.number().int().min(0).max(3).nullish(),
  prognosis: z.enum(["GOOD", "DOUBTFUL", "POOR", "HOPELESS"]).nullish(),
  gingivalWidth: z.number().int().min(0).max(20).nullish(),
  note: z.string().max(200, "Nota del periodontograma: máximo 200 caracteres").nullish(),
  buccal: perioSide.nullish(),
  lingual: perioSide.nullish(),
});

const examSchema = z.object({
  examinedAt: z.iso.datetime({ offset: true, message: "Fecha del examen inválida" }),
  observations: z
    .string()
    .trim()
    .max(1000, "Observaciones: máximo 1000 caracteres")
    .transform((s) => s || undefined),
  chart: z.object({ teeth: z.array(perioTooth).max(32) }),
});
export type ExamInput = z.input<typeof examSchema>;

/** Crea (id = null) o actualiza el borrador de un periodontograma. */
export async function saveExam(patientId: string, id: string | null, input: ExamInput): Promise<ActionResult<PerioExam>> {
  const parsed = examSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const result = await run(() =>
    api<PerioExam>(id ? `/api/periodontal-exams/${id}` : `/api/patients/${patientId}/periodontal-exams`, {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(parsed.data),
    }),
  );
  if (result.ok) revalidatePath(`/app/pacientes/${patientId}/periodontograma`);
  return result;
}

export async function signExam(patientId: string, id: string): Promise<ActionResult<PerioExam>> {
  const result = await run(() => api<PerioExam>(`/api/periodontal-exams/${id}/sign`, { method: "POST" }));
  if (result.ok) revalidatePath(`/app/pacientes/${patientId}/periodontograma`);
  return result;
}

export async function deleteExam(patientId: string, id: string): Promise<ActionResult<null>> {
  const result = await run(() => api<void>(`/api/periodontal-exams/${id}`, { method: "DELETE" }).then(() => null));
  if (result.ok) revalidatePath(`/app/pacientes/${patientId}/periodontograma`);
  return result;
}
