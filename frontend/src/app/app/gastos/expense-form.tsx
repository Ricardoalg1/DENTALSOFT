"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, type ExpenseCategory, type PaymentMethod } from "@/lib/types";
import { registerExpense } from "./actions";

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** Registrar un gasto. onSubmit (no <form action>) para que un error no borre lo escrito. */
export function ExpenseForm({ sites, today }: { sites: { id: string; name: string; open: boolean }[]; today: string }) {
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [fromCash, setFromCash] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const site = sites.find((s) => s.id === siteId);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setError(undefined);
    setSaved(false);
    startTransition(async () => {
      const result = await registerExpense({
        siteId,
        expenseDate: String(f.get("expenseDate")),
        category: String(f.get("category")) as ExpenseCategory,
        description: String(f.get("description")),
        supplierName: String(f.get("supplierName") ?? ""),
        supplierDocument: String(f.get("supplierDocument") ?? ""),
        invoiceNumber: String(f.get("invoiceNumber") ?? ""),
        amount: Number(f.get("amount")),
        method: method as PaymentMethod,
        reference: String(f.get("reference") ?? ""),
        fromCash: method === "CASH" && fromCash,
      });
      if (!result.ok) return setError(result.error);
      setSaved(true);
      form.reset();
      setFromCash(false);
      setMethod("");
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="exp-site">Sede *</Label>
          <select id="exp-site" value={siteId} onChange={(e) => setSiteId(e.target.value)} className={selectClass}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="exp-date">Fecha *</Label>
          <Input id="exp-date" name="expenseDate" type="date" max={today} defaultValue={today} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="exp-category">Categoría *</Label>
          <select id="exp-category" name="category" required defaultValue="" className={selectClass}>
            <option value="" disabled>
              Seleccionar…
            </option>
            {Object.entries(EXPENSE_CATEGORIES).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="exp-amount">Valor ($) *</Label>
          <Input id="exp-amount" name="amount" type="number" min="0.01" step="0.01" required />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="exp-description">Descripción *</Label>
          <Input id="exp-description" name="description" maxLength={300} required placeholder="Ej. Resinas A2 y A3" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="exp-supplier">Proveedor</Label>
          <Input id="exp-supplier" name="supplierName" maxLength={200} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="exp-supplier-doc">NIT / documento</Label>
          <Input id="exp-supplier-doc" name="supplierDocument" maxLength={40} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="exp-invoice">N.º factura del proveedor</Label>
          <Input id="exp-invoice" name="invoiceNumber" maxLength={60} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="exp-method">Medio de pago *</Label>
          <select id="exp-method" value={method} required onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={selectClass}>
            <option value="">Seleccionar…</option>
            {Object.entries(PAYMENT_METHODS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {method && method !== "CASH" && (
          <div className="grid gap-1.5">
            <Label htmlFor="exp-reference">Referencia</Label>
            <Input id="exp-reference" name="reference" maxLength={100} />
          </div>
        )}
        {method === "CASH" && (
          <label className="flex items-center gap-2 self-end pb-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={fromCash}
              disabled={!site?.open}
              onChange={(e) => setFromCash(e.target.checked)}
              className="size-4 accent-primary"
            />
            {site?.open ? "Se paga con efectivo de la caja abierta (se descuenta del cuadre)" : "La caja de esta sede está cerrada"}
          </label>
        )}
      </div>
      <FormError message={error} />
      {saved && <p role="status" className="text-sm text-primary">Gasto registrado.</p>}
      <Button type="submit" disabled={pending} className="w-fit">
        <Plus /> {pending ? "Guardando…" : "Registrar gasto"}
      </Button>
    </form>
  );
}
