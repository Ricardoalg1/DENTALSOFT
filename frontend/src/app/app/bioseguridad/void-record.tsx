"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { voidRecord } from "./actions";

/** Anular un registro con motivo (solo administradores). */
export function VoidRecord({ id }: { id: string }) {
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
            const r = await voidRecord(id, reason);
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
