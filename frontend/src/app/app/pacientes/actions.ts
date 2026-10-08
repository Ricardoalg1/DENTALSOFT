"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { api } from "@/lib/api";
import { errorMessage, keepValues, type FormState } from "@/lib/forms";
import { DOCUMENT_TYPES, REGIMES, SEXES, type DocumentType, type Patient, type Regime, type Sex } from "@/lib/types";

const keys = <T extends string>(o: Record<T, string>) => Object.keys(o) as [T, ...T[]];

/** Texto opcional: "" se envía como ausente. */
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .transform((s) => s || undefined);

const patientSchema = z.object({
  documentType: z.enum(keys<DocumentType>(DOCUMENT_TYPES), "Selecciona el tipo de documento"),
  documentNumber: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{3,20}$/, "Solo letras, números y guiones (3 a 20)"),
  firstName: z.string().trim().min(1, "Requerido").max(60),
  middleName: optional(60),
  firstLastName: z.string().trim().min(1, "Requerido").max(60),
  secondLastName: optional(60),
  birthDate: z.iso.date("Fecha inválida"),
  sex: z.enum(keys<Sex>(SEXES), "Selecciona el sexo"),
  phone: optional(30),
  email: z
    .union([z.literal(""), z.email("Correo inválido")])
    .transform((s) => s || undefined),
  address: optional(200),
  municipality: optional(80),
  residenceZone: z
    .enum(["U", "R", ""])
    .transform((s) => s || undefined),
  regime: z.enum(keys<Regime>(REGIMES), "Selecciona el régimen"),
  insurer: optional(120),
  occupation: optional(80),
  guardianName: optional(150),
  guardianPhone: optional(30),
  guardianRelationship: optional(40),
  notes: optional(1000),
  whatsappConsent: z.enum(["on", "off"]).transform(v => v === "on"),
  // Checkbox: solo viene en el formulario de edición.
  active: z
    .enum(["on", "off"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "on")),
});

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData);
  if (formData.has("activePresent")) raw.active = formData.get("active") === "on" ? "on" : "off";
  raw.whatsappConsent = formData.get("whatsappConsent") === "on" ? "on" : "off";
  return patientSchema.safeParse(raw);
}

export async function createPatient(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = parse(formData);
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values: keepValues(formData) };
  }
  let id: string;
  try {
    const patient = await api<Patient>("/api/patients", { method: "POST", body: JSON.stringify(parsed.data) });
    id = patient.id;
  } catch (e) {
    unstable_rethrow(e);
    return { error: errorMessage(e), values: keepValues(formData) };
  }
  redirect(`/app/pacientes/${id}`);
}

export async function updatePatient(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const parsed = parse(formData);
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values: keepValues(formData) };
  }
  try {
    await api<Patient>(`/api/patients/${id}`, { method: "PUT", body: JSON.stringify(parsed.data) });
  } catch (e) {
    unstable_rethrow(e);
    return { error: errorMessage(e), values: keepValues(formData) };
  }
  redirect(`/app/pacientes/${id}`);
}
