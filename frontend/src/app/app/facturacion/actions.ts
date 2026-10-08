"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { api, ApiError, getMe } from "@/lib/api";
import { errorMessage } from "@/lib/forms";
import type { Invoice, Issuer, RipsUser, ServiceRips } from "@/lib/billing";

export type BillingResult = { ok: true } | { ok: false; error: string };

async function admin() {
  const me = await getMe();
  if (me.role !== "ADMIN") throw new ApiError(403, "Solo un administrador puede gestionar facturación");
}

async function change(path: string, method: string, body?: unknown): Promise<BillingResult> {
  try {
    await admin();
    await api(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    revalidatePath("/app/facturacion", "layout");
    return { ok: true };
  } catch (e) { unstable_rethrow(e); return { ok: false, error: errorMessage(e) }; }
}

export async function saveBillingProfile(profile: Issuer) { return change("/api/billing/profile", "PUT", profile); }

export async function createInvoice(planId: string, itemIds: string[]): Promise<BillingResult> {
  const parsed = z.object({ planId: z.uuid(), itemIds: z.array(z.uuid()).min(1).max(100) }).safeParse({ planId, itemIds });
  if (!parsed.success) return { ok: false, error: "Selecciona al menos un procedimiento realizado" };
  let invoice: Invoice;
  try { await admin(); invoice = await api<Invoice>("/api/invoices", { method: "POST", body: JSON.stringify(parsed.data) }); }
  catch (e) { unstable_rethrow(e); return { ok: false, error: errorMessage(e) }; }
  revalidatePath("/app/facturacion");
  redirect(`/app/facturacion/${invoice.id}`);
}

export async function saveRipsUser(id: string, user: RipsUser) {
  if (!z.uuid().safeParse(id).success) return { ok: false as const, error: "Documento inválido" };
  return change(`/api/invoices/${id}/rips-user`, "PUT", user);
}

export async function saveRipsService(id: string, sourceId: string, service: ServiceRips) {
  if (![id, sourceId].every(v => z.uuid().safeParse(v).success)) return { ok: false as const, error: "Documento inválido" };
  return change(`/api/invoices/${id}/items/${sourceId}/rips`, "PUT", service);
}

export async function prepareInvoice(id: string) {
  if (!z.uuid().safeParse(id).success) return { ok: false as const, error: "Documento inválido" };
  return change(`/api/invoices/${id}/prepare`, "POST");
}

export async function cancelInvoice(id: string, reason: string) {
  if (!z.uuid().safeParse(id).success) return { ok: false as const, error: "Documento inválido" };
  return change(`/api/invoices/${id}/cancel`, "POST", { reason });
}

export async function lookupDataicoInvoice(number: string): Promise<
  { ok: true; invoice: { number: string; uuid: string | null; cufe: string | null; dianStatus: string | null } }
  | { ok: false; error: string }
> {
  if (!/^[A-Za-z0-9-]{1,40}$/.test(number)) return { ok: false, error: "Indica el número completo de factura, por ejemplo FE18" };
  try {
    await admin();
    const invoice = await api<{ number: string; uuid: string | null; cufe: string | null; dianStatus: string | null }>(`/api/billing/dataico/invoices?number=${encodeURIComponent(number)}`);
    return { ok: true, invoice };
  } catch (e) { unstable_rethrow(e); return { ok: false, error: errorMessage(e) }; }
}
