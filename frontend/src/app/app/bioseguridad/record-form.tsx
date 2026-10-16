"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BIOSAFETY_KINDS, type BiosafetyField, type BiosafetyKind } from "@/lib/biosafety";
import { cn } from "@/lib/utils";
import { registerRecord } from "./actions";

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** Formulario de un registro de bioseguridad, armado con la especificación de campos del tipo. */
export function RecordForm({ kind, sites, today }: { kind: BiosafetyKind; sites: { id: string; name: string }[]; today: string }) {
  const fields: readonly BiosafetyField[] = BIOSAFETY_KINDS[kind].fields;
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const data: Record<string, string | number | boolean> = {};
    for (const field of fields) {
      const raw = f.get(field.name);
      if (field.type === "BOOL") {
        if (raw === "true" || raw === "false") data[field.name] = raw === "true";
      } else if (raw !== null && String(raw).trim() !== "") {
        data[field.name] = field.type === "NUMBER" ? Number(String(raw).replace(",", ".")) : String(raw).trim();
      }
    }
    setError(undefined);
    setSaved(false);
    startTransition(async () => {
      const r = await registerRecord({
        siteId,
        kind,
        recordDate: String(f.get("recordDate")),
        data,
        notes: String(f.get("notes") ?? ""),
      });
      if (!r.ok) return setError(r.error);
      setSaved(true);
      form.reset();
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="bs-site">Sede *</Label>
          <select id="bs-site" value={siteId} onChange={(e) => setSiteId(e.target.value)} className={selectClass}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="bs-date">Fecha *</Label>
          <Input id="bs-date" name="recordDate" type="date" max={today} defaultValue={today} required />
        </div>
        {fields.map((field) => {
          const id = `bs-${field.name}`;
          const label = `${field.label}${field.unit && field.unit !== "$" ? ` (${field.unit})` : field.unit === "$" ? " ($)" : ""}${field.required ? " *" : ""}`;
          return (
            <div key={field.name} className={cn("grid gap-1.5", field.wide && "sm:col-span-2 lg:col-span-4")}>
              <Label htmlFor={id}>{label}</Label>
              {field.type === "CHOICE" ? (
                <select id={id} name={field.name} required={field.required} defaultValue="" className={selectClass}>
                  <option value="" disabled={field.required}>
                    {field.required ? "Seleccionar…" : "—"}
                  </option>
                  {Object.entries(field.options ?? {}).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : field.type === "BOOL" ? (
                <select id={id} name={field.name} required={field.required} defaultValue="" className={selectClass}>
                  <option value="" disabled>
                    Seleccionar…
                  </option>
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              ) : (
                <Input
                  id={id}
                  name={field.name}
                  required={field.required}
                  type={field.type === "NUMBER" ? "number" : field.type === "DATE" ? "date" : "text"}
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  maxLength={field.maxLength}
                />
              )}
            </div>
          );
        })}
        <div className="grid gap-1.5 sm:col-span-2 lg:col-span-4">
          <Label htmlFor="bs-notes">Observaciones</Label>
          <Input id="bs-notes" name="notes" maxLength={500} />
        </div>
      </div>
      <FormError message={error} />
      {saved && <p role="status" className="text-sm text-primary">Registro guardado.</p>}
      <Button type="submit" disabled={pending} className="w-fit">
        <Plus /> {pending ? "Guardando…" : "Registrar"}
      </Button>
    </form>
  );
}
