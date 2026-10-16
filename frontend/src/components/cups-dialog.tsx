"use client";

import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CUPS, CUPS_CATEGORIES, searchCups, type CupsEntry } from "@/lib/cups";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** single: el ✓ elige un código y cierra. multi: casillas para elegir varios (importar). */
  mode: "single" | "multi";
  onPick?: (entry: CupsEntry) => void;
  selected?: ReadonlySet<string>;
  onToggle?: (entry: CupsEntry) => void;
  /** Contenido extra al pie (en multi: precio y botón de importar). */
  footer?: React.ReactNode;
  /** Códigos que ya están en la lista de precios (se marcan y no se pueden volver a elegir en multi). */
  existing?: ReadonlySet<string>;
};

/** Páginas a mostrar: primera, última y vecinas de la actual, con "…" en los saltos. */
function pageList(page: number, pages: number): (number | "gap")[] {
  const set = new Set([0, pages - 1, page - 1, page, page + 1].filter((p) => p >= 0 && p < pages));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

/** Buscador del catálogo CUPS odontológico (Resolución 2706 de 2025), por categoría, código o descripción. */
export function CupsDialog({ open, onOpenChange, mode, onPick, selected, onToggle, footer, existing }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todos");
  const [page, setPage] = useState(0);
  const results = searchCups(query, category).sort((a, b) => a.code.localeCompare(b.code));
  const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const rows = results.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Códigos CUPS</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-[16rem_1fr]">
          <div className="grid gap-1.5">
            <Label htmlFor="cups-category">Categoría</Label>
            <select
              id="cups-category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(0);
              }}
              className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              <option value="Todos">Todas</option>
              {CUPS_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cups-query">Buscar</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="cups-query"
                value={query}
                autoFocus
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder="Buscar por código o descripción…"
                className="h-9 pl-8"
              />
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Selección odontológica del CUPS vigente ({CUPS.length} códigos).
        </p>

        {/* La paginación es la del buscador (sobre todos los resultados), no la de la tabla. */}
        <Table pagination={false}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Código</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="hidden sm:table-cell">Categoría</TableHead>
              <TableHead className="w-16 text-right">
                <span className="sr-only">Elegir</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((entry) => {
              const already = existing?.has(entry.code) ?? false;
              const checked = selected?.has(entry.code) ?? false;
              return (
                <TableRow key={entry.code} className={cn(checked && "bg-primary/5")}>
                  <TableCell className="font-mono tabular-nums">{entry.code}</TableCell>
                  <TableCell className="whitespace-normal">
                    {entry.description}
                    {already && <span className="ml-2 text-xs text-muted-foreground">(ya está en la lista)</span>}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{entry.category}</TableCell>
                  <TableCell className="text-right">
                    {mode === "single" ? (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        aria-label={`Elegir ${entry.code} ${entry.description}`}
                        onClick={() => {
                          onPick?.(entry);
                          onOpenChange(false);
                        }}
                      >
                        <Check />
                      </Button>
                    ) : (
                      <input
                        type="checkbox"
                        aria-label={`Importar ${entry.code} ${entry.description}`}
                        checked={checked || already}
                        disabled={already}
                        onChange={() => onToggle?.(entry)}
                        className="size-4 accent-primary"
                      />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No encontramos códigos con esos filtros.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="text-muted-foreground">
            {results.length === 0 ? (
              "Sin resultados"
            ) : (
              <>
                Mostrando{" "}
                <strong className="text-foreground">
                  {current * PAGE_SIZE + 1}–{current * PAGE_SIZE + rows.length}
                </strong>{" "}
                de <strong className="text-foreground">{results.length}</strong>
              </>
            )}
          </p>
          {pages > 1 && (
            <nav aria-label="Páginas" className="flex items-center gap-1">
              <Button type="button" size="icon-sm" variant="outline" aria-label="Página anterior" disabled={current === 0} onClick={() => setPage(current - 1)}>
                <ChevronLeft />
              </Button>
              {pageList(current, pages).map((p, i) =>
                p === "gap" ? (
                  <span key={`gap-${i}`} className="px-1 text-muted-foreground">
                    …
                  </span>
                ) : (
                  <Button
                    key={p}
                    type="button"
                    size="sm"
                    variant={p === current ? "default" : "outline"}
                    aria-current={p === current ? "page" : undefined}
                    onClick={() => setPage(p)}
                    className="min-w-8 tabular-nums"
                  >
                    {p + 1}
                  </Button>
                ),
              )}
              <Button type="button" size="icon-sm" variant="outline" aria-label="Página siguiente" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
                <ChevronRight />
              </Button>
            </nav>
          )}
        </div>

        <DialogFooter>
          {footer}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
