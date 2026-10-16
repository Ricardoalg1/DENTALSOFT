"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Download, Pencil, Plus, Save, Search, Wrench } from "lucide-react";
import { FormError } from "@/components/form-error";
import { PaginationLinks } from "@/components/pagination-links";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatCOP, formatDate } from "@/lib/format";
import {
  EQUIPMENT_KINDS,
  EQUIPMENT_STATUS,
  RISK_CLASSES,
  type Equipment,
  type EquipmentKind,
  type EquipmentStatus,
  type RiskClass,
} from "@/lib/inventory";
import type { Page, Site } from "@/lib/types";
import { exportEquipment, saveEquipment } from "./actions";

const selectClass = "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30";
const STATUS_VARIANT: Record<EquipmentStatus, "secondary" | "outline" | "destructive" | "default"> = {
  ACTIVE: "secondary",
  MAINTENANCE: "default",
  OUT_OF_SERVICE: "destructive",
  RETIRED: "outline",
};

export function EquipmentTab({
  page,
  sites,
  isAdmin,
  filters,
  today,
}: {
  page: Page<Equipment>;
  sites: Site[];
  isAdmin: boolean;
  filters: { q: string; tipo: string; estado: string };
  today: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Equipment | "new" | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const soon = new Date(`${today}T12:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + 30);
  const soonIso = soon.toISOString().slice(0, 10);
  const href = (p: number) => {
    const u = new URLSearchParams({ vista: "equipos", page: String(p) });
    if (filters.q) u.set("q", filters.q);
    if (filters.tipo) u.set("tipo", filters.tipo);
    if (filters.estado) u.set("estado", filters.estado);
    return `/app/inventario?${u}`;
  };

  return (
    <Card>
      <CardContent className="grid gap-4 pt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <form action="/app/inventario" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="vista" value="equipos" />
            <div className="grid gap-1.5">
              <Label htmlFor="eq-q">Buscar</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="eq-q" name="q" defaultValue={filters.q} placeholder="Código, nombre, marca, serie" className="h-9 w-64 pl-8" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="eq-tipo">Tipo</Label>
              <select id="eq-tipo" name="tipo" defaultValue={filters.tipo} className={selectClass}>
                <option value="">Todos</option>
                {Object.entries(EQUIPMENT_KINDS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="eq-estado">Estado</Label>
              <select id="eq-estado" name="estado" defaultValue={filters.estado} className={selectClass}>
                <option value="">Todos (sin dados de baja)</option>
                {Object.entries(EQUIPMENT_STATUS).map(([k, label]) => (
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
                  const r = await exportEquipment();
                  if (!r.ok) return setError(r.error);
                  downloadCsv(
                    "equipos.csv",
                    toCsv(
                      ["Código", "Equipo", "Tipo", "Marca", "Modelo", "Serie", "Registro INVIMA", "Clase de riesgo", "Sede", "Ubicación", "Estado", "Adquirido", "Costo", "Garantía hasta", "Mantenimiento cada (meses)", "Último mantenimiento", "Próximo mantenimiento"],
                      r.data.map((e) => [
                        e.code, e.name, EQUIPMENT_KINDS[e.kind], e.brand, e.model, e.serial, e.invimaRegistry,
                        e.riskClass ? RISK_CLASSES[e.riskClass] : null, e.site.name, e.location, EQUIPMENT_STATUS[e.status],
                        e.acquiredOn, e.cost, e.warrantyUntil, e.maintenanceMonths, e.lastMaintenance, e.nextMaintenance,
                      ]),
                    ),
                  );
                })
              }
            >
              <Download /> Descargar
            </Button>
            {isAdmin && (
              <Button onClick={() => setEditing("new")}>
                <Plus /> Nuevo equipo
              </Button>
            )}
          </div>
        </div>
        <FormError message={error} />

        {page.content.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No hay equipos con esos filtros.{isAdmin && " Registra la hoja de vida de tus equipos con «Nuevo equipo»."}
          </p>
        ) : (
          <Table pagination={false}>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Equipo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Sede</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Próximo mantenimiento</TableHead>
                <TableHead className="w-0 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.content.map((e) => {
                const overdue = e.nextMaintenance && e.nextMaintenance < today;
                const dueSoon = e.nextMaintenance && !overdue && e.nextMaintenance <= soonIso;
                return (
                  <TableRow key={e.id} className={e.status === "RETIRED" ? "opacity-60" : undefined}>
                    <TableCell className="font-mono text-xs">{e.code}</TableCell>
                    <TableCell className="whitespace-normal">
                      <span className="font-medium">{e.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {[e.brand, e.model, e.serial && `Serie ${e.serial}`, e.invimaRegistry && `INVIMA ${e.invimaRegistry}`].filter(Boolean).join(" · ")}
                      </span>
                    </TableCell>
                    <TableCell>
                      {EQUIPMENT_KINDS[e.kind]}
                      {e.riskClass && <span className="block text-xs text-muted-foreground">Clase {RISK_CLASSES[e.riskClass]}</span>}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {e.site.name}
                      {e.location && <span className="block text-xs text-muted-foreground">{e.location}</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[e.status]}>{EQUIPMENT_STATUS[e.status]}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {e.nextMaintenance ? (
                        <Badge variant={overdue ? "destructive" : dueSoon ? "default" : "outline"}>
                          {overdue ? "Vencido " : ""}
                          {formatDate(e.nextMaintenance)}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">{e.maintenanceMonths ? "Sin registros aún" : "—"}</span>
                      )}
                      {e.lastMaintenance && <span className="block text-xs text-muted-foreground">Último {formatDate(e.lastMaintenance)}</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Link
                          href={`/app/bioseguridad/mantenimiento?equipo=${e.id}`}
                          className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                          title="Registrar mantenimiento"
                          aria-label={`Registrar mantenimiento de ${e.name}`}
                        >
                          <Wrench />
                        </Link>
                        {isAdmin && (
                          <Button size="icon-sm" variant="ghost" title="Editar" aria-label={`Editar ${e.name}`} onClick={() => setEditing(e)}>
                            <Pencil />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <PaginationLinks page={page.page} pages={page.totalPages} total={page.totalElements} href={href} />

        {editing && (
          <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>{editing === "new" ? "Nuevo equipo" : `Editar · ${editing.name}`}</DialogTitle>
                <DialogDescription>Hoja de vida del equipo. Los mantenimientos se registran en Bioseguridad → Mantenimiento.</DialogDescription>
              </DialogHeader>
              <EquipmentForm
                equipment={editing === "new" ? null : editing}
                sites={sites}
                onDone={() => {
                  setEditing(null);
                  router.refresh();
                }}
              />
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}

function EquipmentForm({ equipment: e, sites, onDone }: { equipment: Equipment | null; sites: Site[]; onDone: () => void }) {
  const [kind, setKind] = useState<EquipmentKind>(e?.kind ?? "BIOMEDICAL");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const field = (name: string, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`eq-${name}`}>{label}</Label>
      <Input id={`eq-${name}`} name={name} {...props} />
    </div>
  );
  return (
    <form
      className="grid gap-4"
      onSubmit={(ev) => {
        ev.preventDefault();
        const f = new FormData(ev.currentTarget);
        const s = (k: string) => String(f.get(k) ?? "").trim() || null;
        const n = (k: string) => (s(k) === null ? null : Number(s(k)));
        setError(undefined);
        startTransition(async () => {
          const r = await saveEquipment(e?.id ?? null, {
            siteId: String(f.get("siteId")),
            code: String(f.get("code")),
            name: String(f.get("name")),
            kind,
            brand: s("brand"),
            model: s("model"),
            serial: s("serial"),
            invimaRegistry: s("invimaRegistry"),
            riskClass: kind === "BIOMEDICAL" ? (s("riskClass") as RiskClass | null) : null,
            location: s("location"),
            acquiredOn: s("acquiredOn"),
            cost: n("cost"),
            warrantyUntil: s("warrantyUntil"),
            maintenanceMonths: n("maintenanceMonths"),
            status: String(f.get("status")) as EquipmentStatus,
            notes: s("notes"),
          });
          if (!r.ok) return setError(r.error);
          onDone();
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="eq-kind">Tipo *</Label>
          <select id="eq-kind" value={kind} onChange={(ev) => setKind(ev.target.value as EquipmentKind)} className={selectClass}>
            {Object.entries(EQUIPMENT_KINDS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {field("code", "Código de inventario *", { required: true, maxLength: 40, pattern: "[A-Za-z0-9_\\-]+", defaultValue: e?.code })}
        <div className="grid gap-1.5">
          <Label htmlFor="eq-siteId">Sede *</Label>
          <select id="eq-siteId" name="siteId" required defaultValue={e?.site.id ?? sites[0]?.id} className={selectClass}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">{field("name", "Nombre del equipo *", { required: true, maxLength: 150, defaultValue: e?.name, placeholder: "Ej. Autoclave clase B" })}</div>
        <div className="grid gap-1.5">
          <Label htmlFor="eq-status">Estado</Label>
          <select id="eq-status" name="status" defaultValue={e?.status ?? "ACTIVE"} className={selectClass}>
            {Object.entries(EQUIPMENT_STATUS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {field("brand", "Marca", { maxLength: 80, defaultValue: e?.brand ?? "" })}
        {field("model", "Modelo", { maxLength: 80, defaultValue: e?.model ?? "" })}
        {field("serial", "Serie", { maxLength: 80, defaultValue: e?.serial ?? "" })}
        {kind === "BIOMEDICAL" && (
          <>
            {field("invimaRegistry", "Registro sanitario INVIMA", { maxLength: 60, defaultValue: e?.invimaRegistry ?? "" })}
            <div className="grid gap-1.5">
              <Label htmlFor="eq-riskClass">Clase de riesgo</Label>
              <select id="eq-riskClass" name="riskClass" defaultValue={e?.riskClass ?? ""} className={selectClass}>
                <option value="">—</option>
                {Object.entries(RISK_CLASSES).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        {field("location", "Ubicación", { maxLength: 120, defaultValue: e?.location ?? "", placeholder: "Ej. Consultorio 2" })}
        {field("acquiredOn", "Fecha de adquisición", { type: "date", defaultValue: e?.acquiredOn ?? "" })}
        {field("cost", "Costo (COP)", { type: "number", min: 0, step: "0.01", defaultValue: e?.cost ?? "" })}
        {field("warrantyUntil", "Garantía hasta", { type: "date", defaultValue: e?.warrantyUntil ?? "" })}
        {field("maintenanceMonths", "Mantenimiento cada (meses)", { type: "number", min: 1, max: 60, defaultValue: e?.maintenanceMonths ?? "" })}
        <div className="sm:col-span-3">{field("notes", "Observaciones", { maxLength: 500, defaultValue: e?.notes ?? "" })}</div>
      </div>
      {e && e.cost !== null && <p className="text-xs text-muted-foreground">Costo registrado: {formatCOP(e.cost)}.</p>}
      <FormError message={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button disabled={pending}>
          <Save /> {pending ? "Guardando…" : e ? "Guardar cambios" : "Registrar equipo"}
        </Button>
      </div>
    </form>
  );
}
