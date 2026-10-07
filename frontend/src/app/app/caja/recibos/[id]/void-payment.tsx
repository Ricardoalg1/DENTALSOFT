"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form-error";
import { voidPayment } from "../../actions";

export function VoidPayment({ paymentId }: { paymentId: string }) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return <form onSubmit={e => { e.preventDefault(); const reason = String(new FormData(e.currentTarget).get("reason") ?? ""); if (!window.confirm("¿Anular este pago? La anulación quedará registrada.")) return; startTransition(async () => { const result = await voidPayment(paymentId, reason); if (!result.ok) setError(result.error); }); }} className="flex flex-wrap items-end gap-2">
    <div className="grid gap-1"><Label htmlFor="void-reason">Motivo de anulación</Label><Input id="void-reason" name="reason" required minLength={3} maxLength={300} /></div><Button variant="destructive" disabled={pending}>Anular pago</Button><FormError message={error} />
  </form>;
}
