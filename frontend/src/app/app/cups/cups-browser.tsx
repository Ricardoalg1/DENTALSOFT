"use client";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Copy, Search, ArrowUpRight } from "lucide-react";
import { CUPS, CUPS_CATEGORIES, CUPS_SOURCE, searchCups } from "@/lib/cups";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function CupsBrowser({ canManage }: { canManage: boolean }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todos");
  const [sort, setSort] = useState("code");
  const [limit, setLimit] = useState(24);
  const results = searchCups(query, category).sort((a, b) => sort === "code" ? a.code.localeCompare(b.code) : a.description.localeCompare(b.description, "es"));
  async function copy(code: string) {
    try { await navigator.clipboard.writeText(code); toast.success(`Código ${code} copiado`); }
    catch { toast.error("No fue posible copiar. Selecciona el código y cópialo manualmente."); }
  }
  return <div className="grid max-w-6xl gap-6">
    <div><Badge variant="outline">CUPS 2026 · Resolución 2706 de 2025</Badge><h1 className="mt-3 text-3xl font-semibold tracking-tight">Catálogo CUPS de odontología</h1><p className="mt-2 text-muted-foreground">Encuentra el código de una atención y úsalo en los procedimientos de tu clínica.</p></div>
    <div className="rounded-xl border bg-card p-5">
      <label htmlFor="cups-search" className="mb-2 flex items-center gap-2 font-medium"><Search className="size-4" />Buscar por código o descripción</label>
      <div className="flex gap-2"><Input id="cups-search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(24); }} placeholder="Ej. 890203, resina, conducto, exodoncia…" /><Button variant="outline" onClick={() => { setQuery(""); setCategory("Todos"); setLimit(24); }}>Limpiar</Button></div>
      <p className="mt-3 text-xs text-muted-foreground">{CUPS.length} códigos en esta selección odontológica · Fuente: <a href={CUPS_SOURCE} target="_blank" rel="noreferrer" className="underline">Anexo técnico 2 de MinSalud</a></p>
    </div>
    <div className="flex flex-wrap gap-2" aria-label="Filtrar por categoría">{["Todos", ...CUPS_CATEGORIES].map((item) => <Button key={item} variant={category === item ? "default" : "outline"} size="sm" aria-pressed={category === item} onClick={() => { setCategory(item); setLimit(24); }}>{item} <span className="opacity-70">{item === "Todos" ? CUPS.length : CUPS.filter((entry) => entry.category === item).length}</span></Button>)}</div>
    <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className="font-medium">{results.length} códigos encontrados</p><label className="flex items-center gap-2 text-sm">Ordenar<select className="rounded-md border bg-background p-2" value={sort} onChange={(e) => setSort(e.target.value)}><option value="code">Por código</option><option value="description">Por descripción</option></select></label></div>
    {!results.length && <div className="rounded-xl border border-dashed p-10 text-center"><p>No encontramos códigos con esos filtros.</p><p className="mt-2 text-sm text-muted-foreground">Prueba con una palabra del procedimiento o limpia la búsqueda.</p></div>}
    {results.length > 0 && (
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código CUPS</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.slice(0, limit).map((entry) => (
              <TableRow key={entry.code}>
                <TableCell className="align-top font-mono font-semibold text-primary">{entry.code}</TableCell>
                <TableCell className="min-w-64 align-top whitespace-normal">
                  <p className="text-sm font-medium">{entry.description}</p>
                  <details className="mt-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Ver datos del código</summary>
                    <p className="mt-2">Código jerárquico: {entry.code.slice(0, 2)}.{entry.code[2]}.{entry.code[3]}.{entry.code.slice(4)}</p>
                    <p>Descripción del anexo técnico 2 · Edición 2026</p>
                    <a className="underline" href={CUPS_SOURCE} target="_blank" rel="noreferrer">Consultar fuente oficial</a>
                  </details>
                </TableCell>
                <TableCell className="align-top"><Badge variant="secondary">{entry.category}</Badge></TableCell>
                <TableCell className="align-top">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => copy(entry.code)} aria-label={`Copiar código ${entry.code}`}><Copy className="size-4" />Copiar</Button>
                    {canManage && <Link className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10" href={`/app/precios?cups=${entry.code}#nuevo-procedimiento`}>Agregar a precios<ArrowUpRight className="size-4" /></Link>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )}
    {results.length > limit && <Button variant="outline" className="justify-self-center" onClick={() => setLimit(limit + 24)}>Mostrar más códigos ({results.length - limit} pendientes)</Button>}
  </div>;
}
