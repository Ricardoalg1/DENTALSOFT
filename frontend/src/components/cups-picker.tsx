"use client";
import { useState } from "react";
import { searchCups, CUPS } from "@/lib/cups";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function CupsPicker({ id, defaultValue = "" }: { id: string; defaultValue?: string }) {
  const [query, setQuery] = useState("");
  const [code, setCode] = useState(defaultValue);
  const selected = CUPS.find((entry) => entry.code === code);
  const results = query.trim() ? searchCups(query).slice(0, 8) : [];
  return <div className="grid gap-2">
    <Input id={id} name="cupsCode" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Ej. 890203" maxLength={10} />
    {selected && <p className="text-xs text-muted-foreground">{selected.description}</p>}
    <details>
      <summary className="cursor-pointer text-xs text-primary">Buscar en el catálogo CUPS</summary>
      <Input className="mt-2" aria-label="Buscar CUPS por código o descripción" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Código, resina, conducto…" />
      <div className="mt-2 grid gap-1" aria-live="polite">
        {results.map((entry) => <Button key={entry.code} type="button" variant="ghost" className="h-auto justify-start whitespace-normal text-left" onClick={() => { setCode(entry.code); setQuery(""); }}><span><strong>{entry.code}</strong> · {entry.description}</span></Button>)}
        {query.trim() && !results.length && <p className="text-xs text-muted-foreground">No se encontraron códigos.</p>}
      </div>
    </details>
  </div>;
}
