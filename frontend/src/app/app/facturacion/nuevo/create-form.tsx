"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/form-error";
import { formatCOP } from "@/lib/format";
import type { TreatmentItem } from "@/lib/types";
import { createInvoice } from "../actions";

export function CreateInvoiceForm({ planId, items }: { planId: string; items: TreatmentItem[] }) {
  const [selected, setSelected] = useState(new Set(items.map(i => i.id)));
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Este plan no tiene procedimientos realizados disponibles para facturar.</p>;
  return <form onSubmit={e => {
    e.preventDefault(); setError(undefined);
    startTransition(async () => { const result = await createInvoice(planId, [...selected]); if (!result.ok) setError(result.error); });
  }} className="grid gap-4">
    <ul className="grid gap-2">{items.map(i => <li key={i.id}><label className="flex items-center justify-between gap-3 rounded-lg border p-3"><span className="flex items-center gap-3"><input type="checkbox" className="size-4 accent-primary" checked={selected.has(i.id)} onChange={e => { const next = new Set(selected); if (e.target.checked) next.add(i.id); else next.delete(i.id); setSelected(next); }} /><span>{i.description}{i.tooth && ` · Diente ${i.tooth}`} <span className="text-muted-foreground">× {i.quantity}</span></span></span><span className="tabular-nums">{formatCOP(i.total)}</span></label></li>)}</ul>
    <p className="text-sm font-medium">Total: {formatCOP(items.filter(i => selected.has(i.id)).reduce((sum, i) => sum + i.total, 0))}</p>
    <p className="text-xs text-muted-foreground">Los procedimientos seleccionados se reservan en este borrador. Cancélalo si necesitas corregir el plan o volver a facturarlos.</p>
    <FormError message={error} />
    <Button disabled={pending || selected.size === 0} className="w-fit">Crear borrador</Button>
  </form>;
}
