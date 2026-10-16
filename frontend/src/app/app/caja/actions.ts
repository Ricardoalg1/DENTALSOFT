"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { api, getMe } from "@/lib/api";
import { errorMessage } from "@/lib/forms";
import { canManageCash, type CashSession, type Payment } from "@/lib/types";

export type CashActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function openCash(input: { siteId: string; openingAmount: number }): Promise<CashActionResult<CashSession>> {
  const parsed = z.object({ siteId: z.uuid(), openingAmount: z.number().min(0).max(999_999_999_999) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const me = await getMe();
  if (!canManageCash(me)) return { ok: false, error: "No tienes permiso para administrar la caja" };
  try {
    const data = await api<CashSession>("/api/cash-sessions", { method: "POST", body: JSON.stringify(parsed.data) });
    revalidatePath("/app/caja");
    revalidatePath("/app/pacientes", "layout");
    return { ok: true, data };
  } catch (e) { unstable_rethrow(e); return { ok: false, error: errorMessage(e) }; }
}

export async function closeCash(id: string, input: { countedCash: number; notes?: string }): Promise<CashActionResult<CashSession>> {
  const parsed = z.object({ countedCash: z.number().min(0).max(999_999_999_999), notes: z.string().max(500).optional() }).safeParse(input);
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Caja inválida" };
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const me = await getMe();
  if (!canManageCash(me)) return { ok: false, error: "No tienes permiso para administrar la caja" };
  try {
    const data = await api<CashSession>(`/api/cash-sessions/${id}/close`, { method: "POST", body: JSON.stringify(parsed.data) });
    revalidatePath("/app/caja");
    revalidatePath("/app/pacientes", "layout");
    return { ok: true, data };
  } catch (e) { unstable_rethrow(e); return { ok: false, error: errorMessage(e) }; }
}

export async function voidPayment(id: string, reason: string): Promise<CashActionResult<Payment>> {
  const parsed = z.object({ reason: z.string().trim().min(3).max(300) }).safeParse({ reason });
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Recibo inválido" };
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const me = await getMe();
  if (me.role !== "ADMIN") return { ok: false, error: "Solo un administrador puede anular pagos" };
  try {
    const data = await api<Payment>(`/api/payments/${id}/void`, { method: "POST", body: JSON.stringify(parsed.data) });
    revalidatePath("/app/caja");
    revalidatePath(`/app/caja/recibos/${id}`);
    revalidatePath("/app/pacientes", "layout");
    return { ok: true, data };
  } catch (e) { unstable_rethrow(e); return { ok: false, error: errorMessage(e) }; }
}

const money = z.number({ message: "Valor inválido" }).min(0).max(999_999_999_999);
const incomeSchema = z.object({
  siteId: z.uuid({ message: "Elige la sede" }),
  kind: z.enum(["SALE", "ACCOUNT"]),
  incomeDate: z.iso.date({ message: "Fecha inválida" }),
  method: z.enum(["CASH", "DEBIT_CARD", "CREDIT_CARD", "TRANSFER", "OTHER"], { message: "Elige el medio de pago" }),
  paymentTerm: z.enum(["CASH", "CREDIT"]),
  dentistId: z.uuid().optional(),
  payerName: z.string().trim().max(200).optional(),
  payerDocument: z.string().trim().max(40).optional(),
  concept: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(300, "Observaciones: máximo 300 caracteres").optional(),
  reference: z.string().trim().max(100).optional(),
  amount: money.optional(),
  items: z
    .array(
      z.object({
        procedureId: z.uuid().optional(),
        description: z.string().trim().min(1, "Cada línea necesita una descripción").max(200),
        cupsCode: z.string().trim().regex(/^[A-Za-z0-9]{0,10}$/, "CUPS inválido").optional(),
        quantity: z.number().int().min(1, "Cantidad mínima 1").max(999),
        purpose: z.string().regex(/^[0-9]{2}$/).optional(),
        unitPrice: money,
        discountType: z.enum(["PERCENT", "AMOUNT"]).optional(),
        discountValue: money.optional(),
        diagnosisMain: z.string().trim().max(5).optional(),
        diagnosisRelated: z.string().trim().max(5).optional(),
      }),
    )
    .max(100),
});
export type IncomeInput = z.input<typeof incomeSchema>;

/** Registra un ingreso (recibo de venta o abono) en la caja abierta de la sede. */
export async function registerIncome(patientId: string, input: IncomeInput): Promise<CashActionResult<Payment>> {
  if (!z.uuid().safeParse(patientId).success) return { ok: false, error: "Elige el paciente" };
  const parsed = incomeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    const data = await api<Payment>(`/api/patients/${patientId}/payments`, { method: "POST", body: JSON.stringify(parsed.data) });
    revalidatePath("/app/caja");
    revalidatePath("/app/pacientes", "layout");
    return { ok: true, data };
  } catch (e) { unstable_rethrow(e); return { ok: false, error: errorMessage(e) }; }
}
