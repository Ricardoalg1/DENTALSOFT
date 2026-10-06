"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Page, PatientSummary } from "@/lib/types";

export type PickedPatient = { id: string; fullName: string; document?: string };

type Props = {
  value: PickedPatient | null;
  onChange: (patient: PickedPatient | null) => void;
  disabled?: boolean;
};

/** Busca pacientes mientras se escribe (vía /bff/patients) y permite elegir uno. */
export function PatientPicker({ value, onChange, disabled }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ q: string; items: PatientSummary[] } | null>(null);
  const term = query.trim();

  useEffect(() => {
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/bff/patients?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        if (res.ok) {
          const page: Page<PatientSummary> = await res.json();
          setResults({ q: term, items: page.content.filter((p) => p.active) });
        }
      } catch {
        // búsqueda cancelada por una nueva pulsación
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-sm">
        <div className="min-w-0">
          <p className="truncate font-medium">{value.fullName}</p>
          {value.document && <p className="text-xs text-muted-foreground">{value.document}</p>}
        </div>
        {!disabled && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Cambiar paciente" onClick={() => onChange(null)}>
            <X />
          </Button>
        )}
      </div>
    );
  }

  const visible = term.length >= 2 && results?.q === term ? results.items : null;
  return (
    <div className="grid gap-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nombre o documento (mín. 2 letras)"
          aria-label="Buscar paciente"
          className="pl-8"
        />
      </div>
      {visible && (
        <ul className="max-h-48 overflow-y-auto rounded-lg border">
          {visible.length === 0 && <li className="px-2.5 py-2 text-sm text-muted-foreground">Sin resultados</li>}
          {visible.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="flex w-full flex-col items-start px-2.5 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() =>
                  onChange({ id: p.id, fullName: p.fullName, document: `${p.documentType} ${p.documentNumber}` })
                }
              >
                <span className="font-medium">{p.fullName}</span>
                <span className="text-xs text-muted-foreground">
                  {p.documentType} {p.documentNumber} · {p.age} años
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
