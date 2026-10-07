"use client";

import { useActionState, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/lib/forms";
import { addAddendum } from "./actions";

/** Agrega una nota aclaratoria a una evolución firmada (la única forma de corregirla). */
export function AddendumForm({ patientId, noteId }: { patientId: string; noteId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await addAddendum(patientId, noteId, prev, formData);
    if (result?.ok) setOpen(false);
    return result;
  }, undefined);

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <MessageSquarePlus /> Nota aclaratoria
      </Button>
    );
  }
  const textId = `addendum-${noteId}`;
  return (
    <form action={formAction} className="grid w-full gap-2">
      <FormError message={state?.error} />
      <Label htmlFor={textId}>Nota aclaratoria</Label>
      <Textarea
        id={textId}
        name="text"
        rows={3}
        maxLength={2000}
        required
        autoFocus
        defaultValue={state?.values?.text}
        aria-invalid={state?.fieldErrors?.text ? true : undefined}
      />
      {state?.fieldErrors?.text && <p className="text-sm text-destructive">{state.fieldErrors.text[0]}</p>}
      <p className="text-xs text-muted-foreground">Queda registrada con tu nombre y la fecha; no se puede editar después.</p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Guardando…" : "Agregar"}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
