"use client";

import { useState, useTransition } from "react";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CONSENT_PLACEHOLDERS, type ConsentTemplate } from "@/lib/types";
import { saveTemplate } from "./actions";

/** Edita una plantilla existente o crea una nueva (template = undefined). */
export function TemplateEditor({ template, onDone }: { template?: ConsentTemplate; onDone?: () => void }) {
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const prefix = template?.id ?? "new";

  function submit(formData: FormData) {
    setError(undefined);
    setSaved(false);
    startTransition(async () => {
      const result = await saveTemplate(template?.id ?? null, {
        title: String(formData.get("title")),
        body: String(formData.get("body")),
        active: formData.get("active") === "on",
      });
      if (!result.ok) setError(result.error);
      else {
        setSaved(true);
        onDone?.();
      }
    });
  }

  // onSubmit (y no <form action>): React 19 resetea el formulario tras cada acción, incluso si falla,
  // y el usuario perdería lo que escribió.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submit(new FormData(e.currentTarget));
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor={`${prefix}-title`}>Título</Label>
        <Input id={`${prefix}-title`} name="title" required maxLength={150} defaultValue={template?.title} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${prefix}-body`}>Texto</Label>
        <Textarea
          id={`${prefix}-body`}
          name="body"
          required
          rows={10}
          maxLength={20000}
          defaultValue={template?.body}
          className="font-mono text-xs leading-relaxed"
        />
        <p className="text-xs text-muted-foreground">
          Marcadores que se reemplazan al firmar (<code className="rounded bg-muted px-1">{"{{declarante}}"}</code> arma
          &quot;Yo, [quien firma]…&quot; e indica si actúa en nombre del paciente):{" "}
          {CONSENT_PLACEHOLDERS.map((p) => (
            <code key={p} className="mr-1 rounded bg-muted px-1">{`{{${p}}}`}</code>
          ))}
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={template?.active ?? true} className="size-4 accent-primary" />
        Activa (disponible para firmar)
      </label>
      <FormError message={error} />
      {saved && <p className="text-sm text-primary">Plantilla guardada.</p>}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Guardando…" : template ? "Guardar cambios" : "Crear plantilla"}
      </Button>
    </form>
  );
}
