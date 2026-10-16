"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { voidExpense } from "./actions";

/** Anular un gasto con motivo (solo administradores). */
export function VoidExpense({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setOpen(true)}>
        Anular
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <Input aria-label="Motivo de la anulación" placeholder="Motivo" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} className="h-8 w-40" />
      <Button
        size="sm"
        variant="destructive"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await voidExpense(id, reason);
            if (!r.ok) setError(r.error);
          })
        }
      >
        {pending ? "…" : "Anular"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancelar
      </Button>
      {error && <p className="w-full text-right text-xs text-destructive">{error}</p>}
    </div>
  );
}
