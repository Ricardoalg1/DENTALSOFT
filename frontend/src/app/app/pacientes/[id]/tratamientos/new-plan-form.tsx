"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPlan } from "./actions";

export function NewPlanForm({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus /> Nuevo plan
      </Button>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError(undefined);
    startTransition(async () => {
      const result = await createPlan(patientId, {
        title: String(form.get("title")),
        validUntil: String(form.get("validUntil") ?? "") || undefined,
      });
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid w-full gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_11rem_auto] sm:items-end">
      <div className="grid gap-1.5">
        <Label htmlFor="plan-title">Título del plan</Label>
        <Input id="plan-title" name="title" required maxLength={150} autoFocus placeholder="Ej.: Rehabilitación inicial" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="plan-valid">Válido hasta (opcional)</Label>
        <Input id="plan-valid" name="validUntil" type="date" />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creando…" : "Crear"}
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
      <div className="sm:col-span-3">
        <FormError message={error} />
      </div>
    </form>
  );
}
