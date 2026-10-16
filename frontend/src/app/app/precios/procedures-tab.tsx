"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Download, FileSpreadsheet, Pencil, Plus, Power, Search, Trash2, Upload } from "lucide-react";
import { FormError } from "@/components/form-error";
import { PaginationLinks } from "@/components/pagination-links";
import { SearchableSelect } from "@/components/searchable-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsv, parseBool, parseCsv, parseNumber, toCsv } from "@/lib/csv";
import type { CupsEntry } from "@/lib/cups";
import { formatCOP } from "@/lib/format";
import { PROCEDURE_CATEGORIES, type ImportResult, type Page, type Procedure, type TreatmentType } from "@/lib/types";
import { deleteProcedure, exportProcedures, importProcedures, setProcedureActive } from "./actions";
import { ProcedureForm } from "./procedure-form";

export type CatalogFilters = { q: string; estado: string; tratamiento: string };

const HEADERS = ["Nombre", "Código CUPS", "Tratamiento", "Precio", "Por diente", "Activo", "Código interno"];

export function ProceduresTab({
  page,
  treatments,
  filters,
  isAdmin,
  initialCups,
}: {
  page: Page<Procedure>;
  treatments: TreatmentType[];
  filters: CatalogFilters;
  isAdmin: boolean;
  initialCups?: CupsEntry;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Procedure | "new" | null>(initialCups && isAdmin ? "new" : null);
  const [confirmDelete, setConfirmDelete] = useState<Procedure | null>(null);
  const [treatment, setTreatment] = useState(filters.tratamiento);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [importReport, setImportReport] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();
  const file = useRef<HTMLInputElement>(null);

  const href = (p: number) => {
    const u = new URLSearchParams({ vista: "procedimientos", page: String(p) });
    if (filters.q) u.set("q", filters.q);
    if (filters.estado) u.set("estado", filters.estado);
    if (filters.tratamiento) u.set("tratamiento", filters.tratamiento);
    return `/app/precios?${u}`;
  };

  function act(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) {
    setError(undefined);
    setMessage(undefined);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error);
      else {
        setMessage(done);
        router.refresh();
      }
    });
  }

  function onExport() {
    startTransition(async () => {
      const r = await exportProcedures();
      if (!r.ok) return setError(r.error);
      downloadCsv(
        "procedimientos.csv",
        toCsv(HEADERS, r.data.map((p) => [p.name, p.cupsCode, p.treatment?.name ?? "", p.price, p.perTooth, p.active, p.code])),
      );
    });
  }

  async function onImport(f: File) {
    setError(undefined);
    setImportReport(null);
    const rows = parseCsv(await f.text()).map((r) => ({
      name: r.nombre ?? r.procedimiento ?? "",
      cupsCode: (r.codigo_cups ?? r.cups ?? r.codigo ?? "") || undefined,
      treatment: (r.tratamiento ?? "") || undefined,
      price: parseNumber(r.precio ?? r.valor),
      perTooth: parseBool(r.por_diente),
      active: parseBool(r.activo ?? r.estado),
      code: (r.codigo_interno ?? "") || undefined,
    }));
    startTransition(async () => {
      const r = await importProcedures(rows);
      if (!r.ok) return setError(r.error);
      setImportReport(r.data);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {/* Filtros por URL: búsqueda con lupa, estado y tratamiento. */}
        <form action="/app/precios" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="vista" value="procedimientos" />
          <div className="grid gap-1.5">
            <Label htmlFor="proc-q">Buscar</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="proc-q" name="q" defaultValue={filters.q} placeholder="Nombre, CUPS o código" className="h-9 w-64 pl-8" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="proc-estado">Estado</Label>
            <select id="proc-estado" name="estado" defaultValue={filters.estado} className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30">
              <option value="">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
          </div>
          <div className="grid w-60 gap-1.5">
            <Label htmlFor="proc-treatment">Tratamiento</Label>
            <SearchableSelect
              id="proc-treatment"
              name="tratamiento"
              emptyLabel="Todos"
              options={treatments.map((t) => ({ value: t.id, label: t.name }))}
              value={treatment}
              onChange={setTreatment}
            />
          </div>
          <Button type="submit" variant="outline">
            <Search /> Filtrar
          </Button>
        </form>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={pending} onClick={onExport}>
            <Download /> Descargar
          </Button>
          {isAdmin && (
            <>
              <Button variant="outline" disabled={pending} onClick={() => file.current?.click()}>
                <Upload /> Subir
              </Button>
              <input
                ref={file}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void onImport(f);
                }}
              />
              <Button onClick={() => setEditing("new")}>
                <Plus /> Nuevo procedimiento
              </Button>
            </>
          )}
        </div>
      </div>
      {isAdmin && (
        <p className="text-xs text-muted-foreground">
          <FileSpreadsheet className="mr-1 inline size-3.5" />
          Subir: CSV con columnas {HEADERS.join(", ")}. Crea o actualiza por nombre; si el tratamiento no existe, se crea.{" "}
          <button type="button" className="text-primary underline" onClick={() => downloadCsv("plantilla_procedimientos.csv", toCsv(HEADERS, [["Resina de fotocurado", "232101", "Obturación en resina de alta estética", 120000, true, true, "OP-001"]]))}>
            Descargar plantilla
          </button>
        </p>
      )}

      <FormError message={error} />
      {message && <p role="status" className="text-sm text-primary">{message}</p>}
      {importReport && (
        <div role="status" className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          Importación: {importReport.created} creados, {importReport.updated} actualizados
          {importReport.errors.length > 0 && `, ${importReport.errors.length} filas con errores:`}
          {importReport.errors.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-destructive">
              {importReport.errors.slice(0, 10).map((e) => (
                <li key={e.row}>
                  Línea {e.row}: {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {page.content.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No hay procedimientos con esos filtros.</p>
      ) : (
        <Table pagination={false}>
          <TableHeader>
            <TableRow>
              <TableHead>Procedimiento</TableHead>
              <TableHead>Código CUPS</TableHead>
              <TableHead>Tratamiento</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              {isAdmin && <TableHead className="w-0 text-right">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.content.map((p) => (
              <TableRow key={p.id} className={p.active ? undefined : "opacity-60"}>
                <TableCell className="whitespace-normal">
                  <span className="font-medium">{p.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {[p.code, p.perTooth ? "Por diente" : "Por atención"].filter(Boolean).join(" · ")}
                  </span>
                </TableCell>
                <TableCell className="tabular-nums">{p.cupsCode ?? "—"}</TableCell>
                <TableCell className="whitespace-normal">{p.treatment?.name ?? <span className="text-muted-foreground">{PROCEDURE_CATEGORIES[p.category]}</span>}</TableCell>
                <TableCell>{p.active ? <Badge variant="secondary">Activo</Badge> : <Badge variant="outline">Inactivo</Badge>}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCOP(p.price)}</TableCell>
                {isAdmin && (
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button size="icon-sm" variant="ghost" aria-label={`Editar ${p.name}`} title="Editar" onClick={() => setEditing(p)}>
                        <Pencil />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={p.active ? `Desactivar ${p.name}` : `Activar ${p.name}`}
                        title={p.active ? "Desactivar" : "Activar"}
                        disabled={pending}
                        onClick={() => act(() => setProcedureActive(p.id, !p.active), p.active ? "Procedimiento desactivado." : "Procedimiento activado.")}
                      >
                        <Power className={p.active ? "" : "text-primary"} />
                      </Button>
                      <Button size="icon-sm" variant="ghost" className="text-destructive" aria-label={`Eliminar ${p.name}`} title="Eliminar" onClick={() => setConfirmDelete(p)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <PaginationLinks page={page.page} pages={page.totalPages} total={page.totalElements} href={href} />

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editing === "new" ? "Nuevo procedimiento" : "Editar procedimiento"}</DialogTitle>
              <DialogDescription>Registra un procedimiento para usarlo en presupuestos, recibos y evoluciones.</DialogDescription>
            </DialogHeader>
            <ProcedureForm
              procedure={editing === "new" ? undefined : editing}
              initialCups={editing === "new" ? initialCups : undefined}
              treatments={treatments}
              onDone={() => {
                setEditing(null);
                router.refresh();
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {confirmDelete && (
        <Dialog open onOpenChange={(o) => !o && !pending && setConfirmDelete(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>¿Eliminar «{confirmDelete.name}»?</DialogTitle>
              <DialogDescription>
                Solo se puede eliminar si no se ha usado en planes ni recibos. Si ya se usó, desactívalo para que no aparezca en presupuestos nuevos.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmDelete(null)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() => {
                  const p = confirmDelete;
                  setConfirmDelete(null);
                  act(() => deleteProcedure(p.id), "Procedimiento eliminado.");
                }}
              >
                Eliminar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
