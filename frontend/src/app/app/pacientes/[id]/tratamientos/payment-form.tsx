"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Banknote } from "lucide-react";
import { FormError } from "@/components/form-error";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCOP, formatReceipt } from "@/lib/format";
import { PAYMENT_METHODS, type Payment, type PaymentMethod, type Ref } from "@/lib/types";
import { registerPayment } from "./actions";

type Props = {
  patientId: string;
  /** Sedes con caja abierta. */
  openSites: Ref[];
  /** Planes aceptados o completados a los que se puede aplicar el abono. */
  plans: Ref[];
  /** Saldo pendiente, para sugerir el valor. */
  suggestedAmount: number;
};

export function PaymentForm({ patientId, openSites, plans, suggestedAmount }: Props) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [error, setError] = useState<string>();
  const [last, setLast] = useState<Payment>();
  const [pending, startTransition] = useTransition();

  if (openSites.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay una caja abierta.{" "}
        <Link href="/app/caja" className="text-primary hover:underline">
          Abrir caja
        </Link>{" "}
        para registrar pagos.
      </p>
    );
  }

  if (!open) {
    return (
      <div className="grid gap-2">
        {last && (
          <p className="text-sm text-primary">
            Pago de {formatCOP(last.amount)} registrado.{" "}
            <Link href={`/app/caja/recibos/${last.id}`} className="font-medium underline">
              Ver recibo N.º {formatReceipt(last.receiptNumber)}
            </Link>
          </p>
        )}
        <Button className="w-fit" onClick={() => setOpen(true)}>
          <Banknote /> Registrar pago
        </Button>
      </div>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError(undefined);
    startTransition(async () => {
      const result = await registerPayment(patientId, {
        siteId: String(form.get("siteId")),
        amount: Number(form.get("amount")),
        method,
        reference: String(form.get("reference") ?? "") || undefined,
        notes: String(form.get("notes") ?? "") || undefined,
        planId: String(form.get("planId") ?? "") || undefined,
      });
      if (result.ok) {
        setLast(result.data);
        setOpen(false);
      } else setError(result.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="pay-amount">Valor (COP)</Label>
          <Input
            id="pay-amount"
            name="amount"
            required
            type="number"
            min="0.01"
            step="0.01"
            autoFocus
            defaultValue={suggestedAmount > 0 ? String(suggestedAmount) : ""}
          />
        </div>
        <NativeSelect
          name="method"
          id="pay-method"
          label="Medio de pago"
          options={PAYMENT_METHODS}
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
        />
        <NativeSelect
          name="siteId"
          id="pay-site"
          label="Caja (sede)"
          options={Object.fromEntries(openSites.map((s) => [s.id, s.name]))}
          defaultValue={openSites[0].id}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {method !== "CASH" && (
          <div className="grid gap-1.5">
            <Label htmlFor="pay-ref">Referencia o aprobación</Label>
            <Input id="pay-ref" name="reference" maxLength={100} placeholder="N.º de aprobación o comprobante" />
          </div>
        )}
        {plans.length > 0 && (
          <NativeSelect
            name="planId"
            id="pay-plan"
            label="Abonar al plan (opcional)"
            options={Object.fromEntries(plans.map((p) => [p.id, p.name]))}
            placeholder="Sin plan específico"
          />
        )}
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="pay-notes">Nota (opcional)</Label>
          <Input id="pay-notes" name="notes" maxLength={300} />
        </div>
      </div>
      <FormError message={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Registrando…" : "Registrar pago"}
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
