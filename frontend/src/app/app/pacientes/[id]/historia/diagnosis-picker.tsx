"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Diagnosis } from "@/lib/types";

type Props = {
  id: string;
  value: Diagnosis | null;
  onChange: (diagnosis: Diagnosis | null) => void;
  /** Códigos que ya están elegidos en otro campo (no se ofrecen). */
  exclude?: string[];
  disabled?: boolean;
};

/** Busca en el catálogo CIE-10 (vía /bff/icd10) por código o descripción. */
export function DiagnosisPicker({ id, value, onChange, exclude = [], disabled }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ q: string; items: Diagnosis[] } | null>(null);
  const term = query.trim();

  useEffect(() => {
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/bff/icd10?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        if (res.ok) setResults({ q: term, items: await res.json() });
      } catch {
        // búsqueda cancelada por una nueva pulsación
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-sm">
        <p className="min-w-0">
          <span className="font-medium tabular-nums">{value.display}</span> {value.description}
        </p>
        {!disabled && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Quitar diagnóstico" onClick={() => onChange(null)}>
            <X />
          </Button>
        )}
      </div>
    );
  }

  const visible = term.length >= 2 && results?.q === term ? results.items.filter((d) => !exclude.includes(d.code)) : null;
  return (
    <div className="grid gap-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Código o descripción, p. ej. K02.1 o caries"
          className="pl-8"
        />
      </div>
      {visible && (
        <ul className="max-h-56 overflow-y-auto rounded-lg border">
          {visible.length === 0 && <li className="px-2.5 py-2 text-sm text-muted-foreground">Sin resultados</li>}
          {visible.map((d) => (
            <li key={d.code}>
              <button
                type="button"
                className="flex w-full gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onChange(d);
                  setQuery("");
                }}
              >
                <span className="w-12 shrink-0 font-medium tabular-nums">{d.display}</span>
                <span>{d.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
