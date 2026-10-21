"use client";

import { useState, useTransition } from "react";
import { Ban } from "lucide-react";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { voidBatch } from "./actions";

/** Anular una importación de historia clínica hecha por error. */
export function VoidBatchButton({ batchId, created }: { batchId: string; created: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    startTransition(async () => {
      const r = await voidBatch(batchId, reason);
      if (!r.ok) return setError(r.error);
      setOpen(false);
    });
  }

  return (
    <>
      <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => setOpen(true)}>
        <Ban /> Anular
      </Button>
      {open && (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>¿Anular esta importación?</DialogTitle>
              <DialogDescription>
                Los {created.toLocaleString("es-CO")} registros de historia de este lote dejarán de mostrarse en las
                historias de los pacientes. Quedan guardados (no se borran) y podrás volver a importar el archivo
                corregido.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor={`void-${batchId}`}>Motivo</Label>
                <Textarea id={`void-${batchId}`} required minLength={5} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: se importó el archivo de otra sede" />
              </div>
              <FormError message={error} />
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? "Anulando…" : "Anular importación"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
