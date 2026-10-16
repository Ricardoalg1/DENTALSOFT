"use client";

import { useState, useTransition } from "react";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/types";
import { cancelFinancing, payInstallment } from "../actions";

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** Registrar un pago de cuotas en la caja abierta de una sede. */
export function PayInstallment({
  financingId,
  patientId,
  sites,
  suggested,
}: {
  financingId: string;
  patientId: string;
  sites: { id: string; name: string }[];
  suggested: number;
}) {
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [amount, setAmount] = useState(String(suggested));
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  const [pending, startTransition] = useTransition();

  if (sites.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay cajas abiertas: abre una en Recaudos para recibir pagos.</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] sm:items-end">
      <div className="grid gap-1.5">
        <Label htmlFor="pay-site">Sede (caja abierta)</Label>
        <select id="pay-site" value={siteId} onChange={(e) => setSiteId(e.target.value)} className={selectClass}>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pay-amount">Valor ($)</Label>
        <Input id="pay-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pay-method">Medio de pago</Label>
        <select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={selectClass}>
          <option value="">Seleccionar…</option>
          {Object.entries(PAYMENT_METHODS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pay-reference">Referencia</Label>
        <Input id="pay-reference" maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} />
      </div>
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(undefined);
            setDone(undefined);
            const r = await payInstallment(
              { id: financingId, patientId },
              { siteId, amount: Number(amount), method: method as PaymentMethod, reference },
            );
            if (!r.ok) return setError(r.error);
            setDone(`Recibo N.º ${r.data.receiptNumber} registrado.`);
          })
        }
      >
        {pending ? "Registrando…" : "Registrar pago"}
      </Button>
      <div className="sm:col-span-5">
        <FormError message={error} />
        {done && <p role="status" className="text-sm text-primary">{done}</p>}
      </div>
    </div>
  );
}

/** Cancelar el acuerdo con motivo (solo administradores). */
export function CancelFinancing({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  if (!open) {
    return (
      <Button variant="ghost" className="text-destructive" onClick={() => setOpen(true)}>
        Cancelar acuerdo
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input aria-label="Motivo" placeholder="Motivo de la cancelación" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} className="w-64" />
      <Button
        variant="destructive"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await cancelFinancing(id, reason);
            if (!r.ok) setError(r.error);
          })
        }
      >
        Confirmar cancelación
      </Button>
      <Button variant="ghost" onClick={() => setOpen(false)}>
        Volver
      </Button>
      <FormError message={error} />
    </div>
  );
}
