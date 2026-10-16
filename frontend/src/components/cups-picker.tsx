"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import { CupsDialog } from "@/components/cups-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CUPS, type CupsEntry } from "@/lib/cups";

/** Código CUPS: se puede digitar o elegir con la lupa en el catálogo. */
export function CupsPicker({
  id,
  defaultValue = "",
  onPick,
}: {
  id: string;
  defaultValue?: string;
  /** Al elegir del catálogo (p. ej. para completar el nombre si está vacío). */
  onPick?: (entry: CupsEntry) => void;
}) {
  const [code, setCode] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const selected = CUPS.find((entry) => entry.code === code);
  return (
    <div className="grid gap-1.5">
      <div className="flex gap-2">
        <Input id={id} name="cupsCode" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Ej. 890203" maxLength={10} />
        <Button type="button" size="icon" aria-label="Buscar en el catálogo CUPS" title="Buscar en el catálogo CUPS" onClick={() => setOpen(true)}>
          <Search />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{selected ? selected.description : "Puede digitar el código o seleccionarlo con la lupa."}</p>
      {open && (
        <CupsDialog
          open
          onOpenChange={setOpen}
          mode="single"
          onPick={(entry) => {
            setCode(entry.code);
            onPick?.(entry);
          }}
        />
      )}
    </div>
  );
}
