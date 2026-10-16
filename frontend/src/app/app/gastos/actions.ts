"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/forms";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, type Expense, type ExpenseCategory, type PaymentMethod } from "@/lib/types";

export type ExpenseResult<T> = { ok: true; data: T } | { ok: false; error: string };
const keys = <T extends string>(o: Record<T, unknown>) => Object.keys(o) as [T, ...T[]];
const optional = (max: number) => z.string().trim().max(max).transform((s) => s || undefined).optional();

const expenseSchema = z.object({
  siteId: z.uuid({ message: "Elige la sede" }),
  expenseDate: z.iso.date({ message: "Fecha inválida" }),
  category: z.enum(keys<ExpenseCategory>(EXPENSE_CATEGORIES), { message: "Elige la categoría" }),
  description: z.string().trim().min(3, "Describe el gasto").max(300),
  supplierName: optional(200),
  supplierDocument: optional(40),
  invoiceNumber: optional(60),
  amount: z.number({ message: "Valor inválido" }).positive("El valor debe ser mayor que cero").max(999_999_999_999),
  method: z.enum(keys<PaymentMethod>(PAYMENT_METHODS), { message: "Elige el medio de pago" }),
  reference: optional(100),
  fromCash: z.boolean(),
});
export type ExpenseInput = z.input<typeof expenseSchema>;

export async function registerExpense(input: ExpenseInput): Promise<ExpenseResult<Expense>> {
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    const data = await api<Expense>("/api/expenses", { method: "POST", body: JSON.stringify(parsed.data) });
    revalidatePath("/app/gastos");
    revalidatePath("/app/caja");
    return { ok: true, data };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: errorMessage(e) };
  }
}

export async function voidExpense(id: string, reason: string): Promise<ExpenseResult<Expense>> {
  const parsed = z.object({ reason: z.string().trim().min(3, "Escribe el motivo").max(300) }).safeParse({ reason });
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Gasto inválido" };
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    const data = await api<Expense>(`/api/expenses/${id}/void`, { method: "POST", body: JSON.stringify(parsed.data) });
    revalidatePath("/app/gastos");
    revalidatePath("/app/caja");
    return { ok: true, data };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: errorMessage(e) };
  }
}
