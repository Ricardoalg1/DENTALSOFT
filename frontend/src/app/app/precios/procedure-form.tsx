"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { CupsPicker } from "@/components/cups-picker";
import { FormError } from "@/components/form-error";
import { SearchableSelect } from "@/components/searchable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CUPS_PROCEDURE_CATEGORY, type CupsEntry } from "@/lib/cups";
import { ODONTOGRAM_CONDITIONS, PROCEDURE_CATEGORIES, type OdontogramCondition, type Procedure, type TreatmentType } from "@/lib/types";
import { saveProcedure } from "./actions";

/** Hallazgos del odontograma que un procedimiento puede resolver (para sugerir planes). */
const FINDINGS = Object.entries(ODONTOGRAM_CONDITIONS).filter(([, info]) => info.kind === "finding");

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/**
 * Crear o editar un procedimiento: nombre, código CUPS (se digita o se elige con la lupa), tratamiento (con
 * buscador) y precio. Lo demás (código interno, por diente, hallazgo que resuelve) va en "Más opciones".
 */
export function ProcedureForm({
  procedure,
  initialCups,
  treatments,
  onDone,
}: {
  procedure?: Procedure;
  initialCups?: CupsEntry;
  treatments: TreatmentType[];
  onDone: () => void;
}) {
  const [name, setName] = useState(procedure?.name ?? initialCups?.description.slice(0, 150) ?? "");
  const [treatmentId, setTreatmentId] = useState(procedure?.treatment?.id ?? "");
  const [price, setPrice] = useState(procedure ? String(procedure.price) : "");
  const [code, setCode] = useState(procedure?.code ?? "");
  const [perTooth, setPerTooth] = useState(procedure?.perTooth ?? true);
  const [treats, setTreats] = useState<OdontogramCondition | "">(procedure?.treatsCondition ?? "");
  const [active, setActive] = useState(procedure?.active ?? true);
  const [cupsCode, setCupsCode] = useState(procedure?.cupsCode ?? initialCups?.code ?? "");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const p = procedure?.id ?? "new";
  // Un procedimiento antiguo sin tratamiento conserva su categoría hasta que se le asigne uno.
  const legacyCategory = procedure && !procedure.treatment ? procedure.category : undefined;
  const options = treatments
    .filter((t) => t.active || t.id === treatmentId)
    .map((t) => ({ value: t.id, label: t.name, hint: PROCEDURE_CATEGORIES[t.category] }));

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const cups = String(new FormData(e.currentTarget).get("cupsCode") ?? cupsCode);
    setError(undefined);
    startTransition(async () => {
      const r = await saveProcedure(procedure?.id ?? null, {
        name,
        code: code || undefined,
        cupsCode: cups || undefined,
        price: Number(price),
        perTooth,
        treatsCondition: treats || null,
        active,
        treatmentId: treatmentId || undefined,
        category: treatmentId ? undefined : legacyCategory ?? (initialCups ? CUPS_PROCEDURE_CATEGORY[initialCups.category] : undefined),
      });
      if (!r.ok) return setError(r.error);
      onDone();
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`${p}-name`}>Nombre *</Label>
          <Input id={`${p}-name`} required maxLength={150} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Profilaxis dental" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${p}-cups`}>Código</Label>
          <CupsPicker
            id={`${p}-cups`}
            defaultValue={cupsCode}
            onPick={(entry) => {
              setCupsCode(entry.code);
              if (!name.trim()) setName(entry.description.slice(0, 150));
            }}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${p}-treatment`}>Tratamiento *</Label>
          <SearchableSelect id={`${p}-treatment`} options={options} value={treatmentId} onChange={setTreatmentId} placeholder="Seleccione…" />
          {legacyCategory && !treatmentId && (
            <p className="text-xs text-muted-foreground">Sin tratamiento (categoría {PROCEDURE_CATEGORIES[legacyCategory].toLowerCase()}).</p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${p}-price`}>Precio (COP) *</Label>
          <Input id={`${p}-price`} required type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
      </div>

      <details className="rounded-lg border px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">Más opciones</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`${p}-code`}>Código interno</Label>
            <Input id={`${p}-code`} maxLength={20} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ej. OP-001" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${p}-treats`}>Resuelve este hallazgo del odontograma</Label>
            <select id={`${p}-treats`} value={treats} onChange={(e) => setTreats(e.target.value as OdontogramCondition | "")} className={selectClass}>
              <option value="">Ninguno</option>
              {FINDINGS.map(([k, info]) => (
                <option key={k} value={k}>
                  {info.label}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={perTooth} onChange={(e) => setPerTooth(e.target.checked)} className="size-4 accent-primary" />
            Se cobra por diente
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4 accent-primary" />
            Activo
          </label>
        </div>
      </details>

      <FormError message={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          <Save /> {pending ? "Guardando…" : procedure ? "Guardar cambios" : "Crear procedimiento"}
        </Button>
      </div>
    </form>
  );
}
