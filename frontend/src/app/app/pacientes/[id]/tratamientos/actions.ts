"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/forms";
import type { Payment, TreatmentPlan } from "@/lib/types";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const refresh = (patientId: string) => revalidatePath(`/app/pacientes/${patientId}/tratamientos`, "layout");

async function run<T>(patientId: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    refresh(patientId);
    return { ok: true, data };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: errorMessage(e) };
  }
}

const headerSchema = z.object({
  title: z.string().trim().min(3, "Escribe un título").max(150),
  notes: z.string().trim().max(2000).optional(),
  validUntil: z.iso.date().optional(),
});

/** Crea el presupuesto y abre su editor. */
export async function createPlan(patientId: string, input: z.input<typeof headerSchema>): Promise<ActionResult> {
  const parsed = headerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  let plan: TreatmentPlan;
  try {
    plan = await api<TreatmentPlan>(`/api/patients/${patientId}/treatment-plans`, {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: errorMessage(e) };
  }
  redirect(`/app/pacientes/${patientId}/tratamientos/${plan.id}`);
}

export async function updatePlan(patientId: string, planId: string, input: z.input<typeof headerSchema>) {
  const parsed = headerSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  return run(patientId, () =>
    api<TreatmentPlan>(`/api/treatment-plans/${planId}`, { method: "PUT", body: JSON.stringify(parsed.data) }),
  );
}

const itemSchema = z.object({
  procedureId: z.uuid("Selecciona un procedimiento"),
  tooth: z.number().int().min(11).max(85).optional(),
  surfaces: z
    .string()
    .regex(/^[OMDVL]{1,5}$/, "Superficies: O, M, D, V, L")
    .optional(),
  quantity: z.number().int().min(1).max(99).optional(),
  discount: z.number().min(0).optional(),
});

export async function addPlanItems(patientId: string, planId: string, items: z.input<typeof itemSchema>[]) {
  const parsed = z.array(itemSchema).min(1).safeParse(items);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  return run(patientId, () =>
    api<TreatmentPlan>(`/api/treatment-plans/${planId}/items`, { method: "POST", body: JSON.stringify({ items: parsed.data }) }),
  );
}

export async function removePlanItem(patientId: string, planId: string, itemId: string) {
  return run(patientId, () => api<TreatmentPlan>(`/api/treatment-plans/${planId}/items/${itemId}`, { method: "DELETE" }));
}

export async function changePlanStatus(patientId: string, planId: string, action: "accept" | "reject" | "cancel") {
  return run(patientId, () => api<TreatmentPlan>(`/api/treatment-plans/${planId}/${action}`, { method: "POST" }));
}

export async function setItemStatus(
  patientId: string,
  planId: string,
  itemId: string,
  status: "PENDING" | "DONE" | "CANCELLED",
) {
  return run(patientId, () =>
    api<TreatmentPlan>(`/api/treatment-plans/${planId}/items/${itemId}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),
  );
}

const paymentSchema = z.object({
  siteId: z.uuid("Selecciona la caja"),
  amount: z.number({ message: "Valor inválido" }).positive("El valor debe ser mayor que cero").max(999_999_999_999),
  method: z.enum(["CASH", "DEBIT_CARD", "CREDIT_CARD", "TRANSFER", "OTHER"]),
  reference: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(300).optional(),
  planId: z.uuid().optional(),
});

/** Registra el pago y devuelve el recibo creado. */
export async function registerPayment(patientId: string, input: z.input<typeof paymentSchema>) {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  return run(patientId, () =>
    api<Payment>(`/api/patients/${patientId}/payments`, { method: "POST", body: JSON.stringify(parsed.data) }),
  );
}
