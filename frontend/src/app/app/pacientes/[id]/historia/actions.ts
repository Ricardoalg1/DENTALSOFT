"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { api } from "@/lib/api";
import { errorMessage, keepValues, type FormState } from "@/lib/forms";
import { HABITS, MEDICAL_CONDITIONS, type ClinicalNote, type Habit, type MedicalCondition } from "@/lib/types";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

const keys = <T extends string>(o: Record<T, string>) => Object.keys(o) as [T, ...T[]];
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .transform((s) => s || undefined);

// ---------- Antecedentes ----------

const backgroundSchema = z.object({
  conditions: z.array(z.enum(keys<MedicalCondition>(MEDICAL_CONDITIONS))),
  habits: z.array(z.enum(keys<Habit>(HABITS))),
  allergies: optional(500),
  medications: optional(500),
  surgicalHistory: optional(500),
  familyHistory: optional(500),
  observations: optional(1000),
});

/** Como keepValues, pero conserva todas las casillas marcadas (separadas por coma). */
function backgroundValues(formData: FormData) {
  return {
    ...keepValues(formData),
    conditions: formData.getAll("conditions").join(","),
    habits: formData.getAll("habits").join(","),
  };
}

export async function saveBackground(patientId: string, _: FormState, formData: FormData): Promise<FormState> {
  const parsed = backgroundSchema.safeParse({
    ...Object.fromEntries(formData),
    // Los checkboxes con el mismo name llegan como varios valores.
    conditions: formData.getAll("conditions"),
    habits: formData.getAll("habits"),
  });
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values: backgroundValues(formData) };
  }
  try {
    await api(`/api/patients/${patientId}/clinical-background`, { method: "PUT", body: JSON.stringify(parsed.data) });
  } catch (e) {
    return { error: errorMessage(e), values: backgroundValues(formData) };
  }
  revalidatePath(`/app/pacientes/${patientId}`, "layout");
  redirect(`/app/pacientes/${patientId}/historia`);
}

// ---------- Evoluciones ----------

const code = z.string().regex(/^[A-Za-z]\d{2}\.?\d?$/, "Código CIE-10 inválido");
const noteSchema = z.object({
  appointmentId: z.uuid().optional(),
  attendedAt: z.iso.datetime({ offset: true, message: "Fecha de atención inválida" }),
  reason: optional(500),
  currentIllness: optional(2000),
  examination: optional(4000),
  diagnosisMain: code.optional(),
  diagnosisType: z.enum(["IMPRESSION", "CONFIRMED_NEW", "CONFIRMED_REPEAT"]).optional(),
  diagnosisRelated: z.array(code).max(3, "Máximo 3 diagnósticos relacionados"),
  procedures: optional(4000),
  plan: optional(2000),
});
export type NoteInput = z.input<typeof noteSchema>;

/** Crea (id = null) o actualiza un borrador. */
export async function saveNote(patientId: string, id: string | null, input: NoteInput): Promise<ActionResult<ClinicalNote>> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const result = await run(() =>
    api<ClinicalNote>(id ? `/api/clinical-notes/${id}` : `/api/patients/${patientId}/clinical-notes`, {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(parsed.data),
    }),
  );
  if (result.ok) revalidatePath(`/app/pacientes/${patientId}/historia`);
  return result;
}

export async function signNote(patientId: string, id: string): Promise<ActionResult<ClinicalNote>> {
  const result = await run(() => api<ClinicalNote>(`/api/clinical-notes/${id}/sign`, { method: "POST" }));
  // Firmar puede cerrar la cita como atendida: refrescar toda la ficha.
  if (result.ok) revalidatePath(`/app/pacientes/${patientId}`, "layout");
  return result;
}

export async function deleteNote(patientId: string, id: string): Promise<ActionResult<null>> {
  const result = await run(() => api<void>(`/api/clinical-notes/${id}`, { method: "DELETE" }).then(() => null));
  if (result.ok) revalidatePath(`/app/pacientes/${patientId}/historia`);
  return result;
}

const addendumSchema = z.object({ text: z.string().trim().min(1, "Escribe la nota").max(2000, "Máximo 2000 caracteres") });

export async function addAddendum(
  patientId: string,
  noteId: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = addendumSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values: keepValues(formData) };
  try {
    await api(`/api/clinical-notes/${noteId}/addenda`, { method: "POST", body: JSON.stringify(parsed.data) });
  } catch (e) {
    return { error: errorMessage(e), values: keepValues(formData) };
  }
  revalidatePath(`/app/pacientes/${patientId}/historia`);
  return { ok: true };
}
