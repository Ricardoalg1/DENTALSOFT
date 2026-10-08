"use client";

import { useState, useTransition } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form-error";
import type { Invoice } from "@/lib/billing";
import { cancelInvoice, prepareInvoice } from "../actions";

export function InvoiceControls({ invoice }: { invoice: Invoice }) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return <div className="no-print grid gap-4">
    <div className="flex flex-wrap gap-2">
      {invoice.status === "DRAFT" && <Button disabled={pending || !invoice.validation.dataReady} onClick={() => { setError(undefined); startTransition(async () => { const result = await prepareInvoice(invoice.id); if (!result.ok) setError(result.error); }); }}>Preparar y fijar datos</Button>}
      <Button variant="outline" onClick={() => window.print()}><Printer /> Imprimir borrador</Button>
      {invoice.status === "PREPARED" && <a href={`/bff/invoices/${invoice.id}/rips-draft`} download className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted">Descargar borrador RIPS</a>}
    </div>
    {invoice.status !== "CANCELLED" && <form onSubmit={e => {
      e.preventDefault(); const reason = String(new FormData(e.currentTarget).get("reason") ?? "");
      if (!window.confirm("¿Cancelar este borrador y liberar los procedimientos reservados?")) return;
      setError(undefined); startTransition(async () => { const result = await cancelInvoice(invoice.id, reason); if (!result.ok) setError(result.error); });
    }} className="flex flex-wrap items-end gap-2"><div className="grid gap-1"><Label htmlFor="invoice-cancel-reason">Motivo de cancelación del borrador</Label><Input id="invoice-cancel-reason" name="reason" required minLength={3} maxLength={300} /></div><Button variant="outline" disabled={pending}>Cancelar borrador</Button></form>}
    <FormError message={error} />
  </div>;
}
