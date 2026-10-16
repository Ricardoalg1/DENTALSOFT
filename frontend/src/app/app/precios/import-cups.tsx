"use client";

import { useState, useTransition } from "react";
import { BookOpen } from "lucide-react";
import { CupsDialog } from "@/components/cups-dialog";
import { SearchableSelect } from "@/components/searchable-select";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CUPS_PROCEDURE_CATEGORY, type CupsEntry } from "@/lib/cups";
import type { TreatmentType } from "@/lib/types";
import { importCupsProcedures } from "./actions";

/** Importa varios códigos CUPS a la lista de precios (nombre = descripción CUPS, mismo precio inicial para todos). */
export function ImportCups({ existing, treatments }: { existing: string[]; treatments: TreatmentType[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Map<string, CupsEntry>>(new Map());
  const [price, setPrice] = useState("0");
  const [treatmentId, setTreatmentId] = useState("");
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<string>();
  const [pending, startTransition] = useTransition();

  function toggle(entry: CupsEntry) {
    setSelected((s) => {
      const next = new Map(s);
      if (next.has(entry.code)) next.delete(entry.code);
      else next.set(entry.code, entry);
      return next;
    });
  }

  function submit() {
    setError(undefined);
    startTransition(async () => {
      const r = await importCupsProcedures(
        Number(price),
        [...selected.values()].map((e) => ({
          cupsCode: e.code,
          name: e.description.slice(0, 150),
          category: CUPS_PROCEDURE_CATEGORY[e.category] ?? "OTHER",
        })),
        treatmentId,
      );
      if (!r.ok) return setError(r.error);
      setResult(
        `${r.data.created} ${r.data.created === 1 ? "procedimiento importado" : "procedimientos importados"}` +
          (r.data.skipped ? ` · ${r.data.skipped} ya estaban en la lista` : "") +
          ". Revisa sus precios.",
      );
      setSelected(new Map());
      setOpen(false);
    });
  }

  return (
    <div className="grid gap-2">
      <Button variant="outline" className="w-fit" onClick={() => { setResult(undefined); setOpen(true); }}>
        <BookOpen /> Importar desde CUPS
      </Button>
      {result && <p role="status" className="text-sm text-primary">{result}</p>}
      {open && (
        <CupsDialog
          open
          onOpenChange={setOpen}
          mode="multi"
          selected={new Set(selected.keys())}
          existing={new Set(existing)}
          onToggle={toggle}
          footer={
            <div className="mr-auto flex flex-wrap items-end gap-2">
              <div className="grid w-56 gap-1">
                <Label htmlFor="import-treatment" className="text-xs">Tratamiento (opcional)</Label>
                <SearchableSelect
                  id="import-treatment"
                  emptyLabel="Sin tratamiento"
                  options={treatments.filter((t) => t.active).map((t) => ({ value: t.id, label: t.name }))}
                  value={treatmentId}
                  onChange={setTreatmentId}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="import-price" className="text-xs">Precio inicial (COP)</Label>
                <Input id="import-price" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="h-9 w-36" />
              </div>
              <Button disabled={pending || selected.size === 0} onClick={submit}>
                {pending ? "Importando…" : `Importar ${selected.size || ""}`.trim()}
              </Button>
              <FormError message={error} />
            </div>
          }
        />
      )}
    </div>
  );
}
