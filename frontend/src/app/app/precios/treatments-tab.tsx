"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Download, ListPlus, Pencil, Plus, Power, Save, Search, Trash2, Upload } from "lucide-react";
import { FormError } from "@/components/form-error";
import { PaginationLinks } from "@/components/pagination-links";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsv, normalizeKey, parseBool, parseCsv, toCsv } from "@/lib/csv";
import { PROCEDURE_CATEGORIES, type ImportResult, type Page, type ProcedureCategory, type TreatmentType } from "@/lib/types";
import {
  deleteTreatment,
  exportTreatments,
  importTreatments,
  loadTreatmentPresets,
  saveTreatment,
  setTreatmentActive,
} from "./actions";

const HEADERS = ["Nombre", "Categoría", "Descripción", "Activo"];
const selectClass = "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30";

/** Categoría desde el CSV: acepta la clave (RESTORATIVE) o el nombre en español (Operatoria). */
function categoryFrom(value: string | undefined): ProcedureCategory | null {
  if (!value) return null;
  const v = normalizeKey(value);
  const entry = (Object.entries(PROCEDURE_CATEGORIES) as [ProcedureCategory, string][]).find(
    ([k, label]) => normalizeKey(k) === v || normalizeKey(label) === v,
  );
  return entry?.[0] ?? null;
}

export function TreatmentsTab({
  page,
  filters,
  isAdmin,
}: {
  page: Page<TreatmentType>;
  filters: { q: string; estado: string; categoria: string };
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<TreatmentType | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TreatmentType | null>(null);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [importReport, setImportReport] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();
  const file = useRef<HTMLInputElement>(null);

  const href = (p: number) => {
    const u = new URLSearchParams({ vista: "tratamientos", page: String(p) });
    if (filters.q) u.set("q", filters.q);
    if (filters.estado) u.set("estado", filters.estado);
    if (filters.categoria) u.set("categoria", filters.categoria);
    return `/app/precios?${u}`;
  };

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, done: string) {
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

  async function onImport(f: File) {
    setError(undefined);
    setImportReport(null);
    const rows = parseCsv(await f.text()).map((r) => ({
      name: r.nombre ?? r.tratamiento ?? "",
      category: categoryFrom(r.categoria),
      description: (r.descripcion ?? "") || undefined,
      active: parseBool(r.activo ?? r.estado),
    }));
    startTransition(async () => {
      const r = await importTreatments(rows);
      if (!r.ok) return setError(r.error);
      setImportReport(r.data);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form action="/app/precios" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="vista" value="tratamientos" />
          <div className="grid gap-1.5">
            <Label htmlFor="tr-q">Buscar</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="tr-q" name="q" defaultValue={filters.q} placeholder="Nombre o descripción" className="h-9 w-64 pl-8" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tr-estado">Estado</Label>
            <select id="tr-estado" name="estado" defaultValue={filters.estado} className={selectClass}>
              <option value="">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tr-categoria">Categoría</Label>
            <select id="tr-categoria" name="categoria" defaultValue={filters.categoria} className={selectClass}>
              <option value="">Todas</option>
              {Object.entries(PROCEDURE_CATEGORIES).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline">
            <Search /> Filtrar
          </Button>
        </form>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await exportTreatments();
                if (!r.ok) return setError(r.error);
                downloadCsv("tratamientos.csv", toCsv(HEADERS, r.data.map((t) => [t.name, PROCEDURE_CATEGORIES[t.category], t.description, t.active])));
              })
            }
          >
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
              <Button
                variant="outline"
                disabled={pending}
                onClick={() =>
                  act(async () => {
                    const r = await loadTreatmentPresets();
                    return r.ok ? { ok: true } : r;
                  }, "Tratamientos predeterminados cargados (los que faltaban).")
                }
              >
                <ListPlus /> Cargar predeterminados
              </Button>
              <Button onClick={() => setEditing("new")}>
                <Plus /> Nuevo tratamiento
              </Button>
            </>
          )}
        </div>
      </div>
      {isAdmin && (
        <p className="text-xs text-muted-foreground">
          Subir: CSV con columnas {HEADERS.join(", ")}. Crea o actualiza por nombre. Categorías:{" "}
          {Object.values(PROCEDURE_CATEGORIES).join(", ")}.
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
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No hay tratamientos con esos filtros.{isAdmin && " Créalos o carga los predeterminados."}
        </p>
      ) : (
        <Table pagination={false}>
          <TableHeader>
            <TableRow>
              <TableHead>Tratamiento</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead className="text-right">Procedimientos</TableHead>
              <TableHead>Estado</TableHead>
              {isAdmin && <TableHead className="w-0 text-right">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.content.map((t) => (
              <TableRow key={t.id} className={t.active ? undefined : "opacity-60"}>
                <TableCell className="whitespace-normal">
                  <span className="font-medium">{t.name}</span>
                  {t.description && <span className="block text-xs text-muted-foreground">{t.description}</span>}
                </TableCell>
                <TableCell>{PROCEDURE_CATEGORIES[t.category]}</TableCell>
                <TableCell className="text-right tabular-nums">{t.procedures}</TableCell>
                <TableCell>{t.active ? <Badge variant="secondary">Activo</Badge> : <Badge variant="outline">Inactivo</Badge>}</TableCell>
                {isAdmin && (
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button size="icon-sm" variant="ghost" aria-label={`Editar ${t.name}`} title="Editar" onClick={() => setEditing(t)}>
                        <Pencil />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t.active ? `Desactivar ${t.name}` : `Activar ${t.name}`}
                        title={t.active ? "Desactivar" : "Activar"}
                        disabled={pending}
                        onClick={() => act(() => setTreatmentActive(t.id, !t.active), t.active ? "Tratamiento desactivado." : "Tratamiento activado.")}
                      >
                        <Power className={t.active ? "" : "text-primary"} />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-destructive"
                        aria-label={`Eliminar ${t.name}`}
                        title={t.procedures > 0 ? "Tiene procedimientos: desactívalo" : "Eliminar"}
                        disabled={t.procedures > 0}
                        onClick={() => setConfirmDelete(t)}
                      >
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
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing === "new" ? "Nuevo tratamiento" : "Editar tratamiento"}</DialogTitle>
              <DialogDescription>Los procedimientos de la lista de precios se agrupan por tratamiento.</DialogDescription>
            </DialogHeader>
            <TreatmentForm
              treatment={editing === "new" ? undefined : editing}
              onDone={() => {
                setEditing(null);
                router.refresh();
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {confirmDelete && (
        <Dialog open onOpenChange={(o) => !o && setConfirmDelete(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>¿Eliminar «{confirmDelete.name}»?</DialogTitle>
              <DialogDescription>Esta acción no se puede deshacer.</DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmDelete(null)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  const t = confirmDelete;
                  setConfirmDelete(null);
                  act(() => deleteTreatment(t.id), "Tratamiento eliminado.");
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

function TreatmentForm({ treatment, onDone }: { treatment?: TreatmentType; onDone: () => void }) {
  const [name, setName] = useState(treatment?.name ?? "");
  const [category, setCategory] = useState<ProcedureCategory | "">(treatment?.category ?? "");
  const [description, setDescription] = useState(treatment?.description ?? "");
  const [active, setActive] = useState(treatment?.active ?? true);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        startTransition(async () => {
          const r = await saveTreatment(treatment?.id ?? null, { name, category: category as ProcedureCategory, description, active });
          if (!r.ok) return setError(r.error);
          onDone();
        });
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="tr-name">Nombre *</Label>
        <Input id="tr-name" required maxLength={150} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Corona en zirconio" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="tr-category">Categoría *</Label>
        <select id="tr-category" required value={category} onChange={(e) => setCategory(e.target.value as ProcedureCategory)} className={`${selectClass} w-full`}>
          <option value="" disabled>
            Seleccione…
          </option>
          {Object.entries(PROCEDURE_CATEGORIES).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">La categoría se usa en informes y RIPS para los procedimientos de este tratamiento.</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="tr-description">Descripción</Label>
        <Input id="tr-description" maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4 accent-primary" />
        Activo
      </label>
      <FormError message={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          <Save /> {pending ? "Guardando…" : treatment ? "Guardar cambios" : "Crear tratamiento"}
        </Button>
      </div>
    </form>
  );
}
