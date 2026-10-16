"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/forms";
import { PAYMENT_METHODS, type Financing, type Payment, type PaymentMethod } from "@/lib/types";

export type FinancingResult<T> = { ok: true; data: T } | { ok: false; error: string };
const keys = <T extends string>(o: Record<T, unknown>) => Object.keys(o) as [T, ...T[]];

async function run<T>(fn: () => Promise<T>, paths: string[]): Promise<FinancingResult<T>> {
  try {
    const data = await fn();
    paths.forEach((p) => revalidatePath(p));
    return { ok: true, data };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: errorMessage(e) };
  }
}

const financingSchema = z.object({
  concept: z.string().trim().min(3, "Escribe el concepto").max(200),
  totalAmount: z.number({ message: "Total inválido" }).positive("El total debe ser mayor que cero").max(999_999_999_999),
  downPayment: z.number().min(0, "La cuota inicial no puede ser negativa").max(999_999_999_999),
  installments: z.number().int().min(1, "Mínimo 1 cuota").max(60, "Máximo 60 cuotas"),
  frequency: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]),
  firstDue: z.iso.date({ message: "Fecha de la primera cuota inválida" }),
  notes: z.string().trim().max(500).transform((s) => s || undefined).optional(),
});
export type FinancingInput = z.input<typeof financingSchema>;

export async function createFinancing(patientId: string, input: FinancingInput): Promise<FinancingResult<Financing>> {
  if (!z.uuid().safeParse(patientId).success) return { ok: false, error: "Elige el paciente" };
  const parsed = financingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  return run(
    () => api<Financing>(`/api/patients/${patientId}/financings`, { method: "POST", body: JSON.stringify(parsed.data) }),
    ["/app/financiamiento"],
  );
}

const installmentPaymentSchema = z.object({
  siteId: z.uuid({ message: "Elige la sede" }),
  amount: z.number({ message: "Valor inválido" }).positive("El valor debe ser mayor que cero").max(999_999_999_999),
  method: z.enum(keys<PaymentMethod>(PAYMENT_METHODS), { message: "Elige el medio de pago" }),
  reference: z.string().trim().max(100).transform((s) => s || undefined).optional(),
});

/** Abono a las cuotas: es un ingreso (abono a cuenta) en la caja abierta de la sede, ligado al financiamiento. */
export async function payInstallment(financing: { id: string; patientId: string }, input: z.input<typeof installmentPaymentSchema>) {
  const parsed = installmentPaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  return run(
    () =>
      api<Payment>(`/api/patients/${financing.patientId}/payments`, {
        method: "POST",
        body: JSON.stringify({ ...parsed.data, kind: "ACCOUNT", financingId: financing.id, concept: "Pago de cuota" }),
      }),
    ["/app/financiamiento", `/app/financiamiento/${financing.id}`, "/app/caja"],
  );
}

export async function cancelFinancing(id: string, reason: string): Promise<FinancingResult<Financing>> {
  const parsed = z.object({ reason: z.string().trim().min(3, "Escribe el motivo").max(300) }).safeParse({ reason });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  return run(
    () => api<Financing>(`/api/financings/${id}/cancel`, { method: "POST", body: JSON.stringify(parsed.data) }),
    ["/app/financiamiento", `/app/financiamiento/${id}`],
  );
}
