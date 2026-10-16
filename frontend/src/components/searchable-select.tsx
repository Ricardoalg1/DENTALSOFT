"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type SearchableOption = { value: string; label: string; hint?: string; disabled?: boolean };

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Selector con buscador: la primera fila de la lista es un cuadro de búsqueda con lupa que filtra mientras se
 * escribe. Teclado: ↑ ↓ para moverse, Enter para elegir, Esc para cerrar. Envía el valor en un input oculto (name).
 */
export function SearchableSelect({
  id,
  name,
  options,
  value,
  onChange,
  placeholder = "Seleccione…",
  emptyLabel,
  required,
  disabled,
  className,
}: {
  id?: string;
  name?: string;
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Opción para dejarlo vacío (p. ej. "Todos"). */
  emptyLabel?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value);
  const all: SearchableOption[] = emptyLabel ? [{ value: "", label: emptyLabel }, ...options] : options;
  const q = normalize(query.trim());
  const shown = q ? all.filter((o) => normalize(`${o.label} ${o.hint ?? ""}`).includes(q)) : all;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function pick(o: SearchableOption) {
    if (o.disabled) return;
    onChange(o.value);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={root} className={cn("relative", className)}>
      {name && <input type="hidden" name={name} value={value} required={required} />}
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          setOpen(!open);
          setCursor(0);
        }}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected?.label ?? (value === "" && emptyLabel ? emptyLabel : placeholder)}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-56 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg">
          <div className="relative border-b">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              aria-label="Buscar"
              value={query}
              placeholder="Buscar…"
              onChange={(e) => {
                setQuery(e.target.value);
                setCursor(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setCursor((c) => Math.min(c + 1, shown.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setCursor((c) => Math.max(c - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (shown[cursor]) pick(shown[cursor]);
                } else if (e.key === "Escape") setOpen(false);
              }}
              className="h-9 w-full bg-transparent pr-2 pl-8 text-sm outline-none"
            />
          </div>
          <ul id={listId} role="listbox" className="max-h-64 overflow-y-auto py-1">
            {shown.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</li>}
            {shown.map((o, i) => (
              <li
                key={o.value || "__empty"}
                role="option"
                aria-selected={o.value === value}
                aria-disabled={o.disabled}
                onMouseEnter={() => setCursor(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm",
                  i === cursor && "bg-muted",
                  o.disabled && "cursor-not-allowed opacity-50",
                )}
              >
                <Check className={cn("size-4 shrink-0", o.value === value ? "opacity-100" : "opacity-0")} />
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.hint && <span className="shrink-0 text-xs text-muted-foreground">{o.hint}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
