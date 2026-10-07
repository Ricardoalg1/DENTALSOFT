"use server";

import { revalidatePath } from "next/cache";
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
  } catch (e) { return { ok: false, error: errorMessage(e) }; }
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
  } catch (e) { return { ok: false, error: errorMessage(e) }; }
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
  } catch (e) { return { ok: false, error: errorMessage(e) }; }
}
