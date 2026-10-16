"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeftRight, CalendarX, ChevronLeft, ChevronRight, Clock3, Download, Package, Pencil, Plus, Power, Search } from "lucide-react";
import { FormError } from "@/components/form-error";
import { NativeSelect } from "@/components/native-select";
import { SearchableSelect } from "@/components/searchable-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatCOP, formatDateTime } from "@/lib/format";
import {
  ITEM_CATEGORIES,
  MOVEMENT_KINDS,
  type InventoryItem,
  type InventoryOverview,
  type ItemCategory,
  type MovementKind,
} from "@/lib/inventory";
import type { Role, Site } from "@/lib/types";
import { registerInventoryMovement, saveInventoryItem } from "./actions";

const PAGE = 15;
const qty = (n: number) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(n);
const date = (s: string) => s.split("-").reverse().join("/");
const historyKinds: Record<string, string> = { ...MOVEMENT_KINDS, TRANSFER_OUT: "Salida por traslado", TRANSFER_IN: "Entrada por traslado" };
const selectClass = "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30";

export function InventoryPanel({
  data,
  sites,
  role,
  today,
  view,
}: {
  data: InventoryOverview;
  sites: Site[];
  role: Role;
  today: string;
  view: "stock" | "movements";
}) {
  const router = useRouter();
  const [siteId, setSiteId] = useState(sites.find((s) => s.active)?.id ?? sites[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ItemCategory | "">("");
  const [status, setStatus] = useState<"active" | "inactive" | "">("active");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<InventoryItem | "new" | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const canMove = role === "ADMIN" || role === "ASSISTANT";
  const isAdmin = role === "ADMIN";
  const siteNames = Object.fromEntries(sites.map((s) => [s.id, s.name]));
  const itemById = Object.fromEntries(data.items.map((i) => [i.id, i]));
  const expiryLimit = new Date(`${today}T12:00:00Z`);
  expiryLimit.setUTCDate(expiryLimit.getUTCDate() + 30);
  const soon = expiryLimit.toISOString().slice(0, 10);
  const stock = data.stock.filter((s) => s.siteId === siteId);
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = norm(search.trim());
  const total = (id: string) => stock.filter((s) => s.itemId === id).reduce((sum, s) => sum + s.quantity, 0);
  const available = (id: string) => stock.filter((s) => s.itemId === id && (!s.expiresOn || s.expiresOn >= today)).reduce((sum, s) => sum + s.quantity, 0);
  const low = data.items.filter((i) => i.active && available(i.id) < i.minimum).length;
  const expired = stock.filter((s) => s.quantity > 0 && s.expiresOn && s.expiresOn < today).length;
  const expiring = stock.filter((s) => s.quantity > 0 && s.expiresOn && s.expiresOn >= today && s.expiresOn <= soon).length;

  const items = data.items.filter(
    (i) =>
      (!category || i.category === category) &&
      (!status || (status === "active" ? i.active : !i.active)) &&
      (!q || norm(`${i.name} ${i.code}`).includes(q)),
  );
  const pages = Math.max(1, Math.ceil(items.length / PAGE));
  const current = Math.min(page, pages - 1);
  const shown = items.slice(current * PAGE, current * PAGE + PAGE);
  const movements = data.movements.filter(
    (m) => m.siteId === siteId && (!q || norm(`${itemById[m.itemId]?.name ?? ""} ${itemById[m.itemId]?.code ?? ""}`).includes(q)),
  );
  const movementPages = Math.max(1, Math.ceil(movements.length / PAGE));
  const currentMovementPage = Math.min(page, movementPages - 1);

  function toggle(i: InventoryItem) {
    setError(undefined);
    startTransition(async () => {
      const { id, ...rest } = i;
      const r = await saveInventoryItem(id, { ...rest, active: !i.active });
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  function exportCsv() {
    downloadCsv(
      `inventario_${siteNames[siteId] ?? "sede"}.csv`,
      toCsv(
        ["Código", "Nombre", "Categoría", "Unidad", "Costo unitario", "Existencias", "Disponible", "Mínimo", "Activo"],
        items.map((i) => [i.code, i.name, ITEM_CATEGORIES[i.category], i.unit, i.unitCost, total(i.id), available(i.id), i.minimum, i.active]),
      ),
    );
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            [low, "Bajo el mínimo", Package, "reference-icon-orange"],
            [expired, "Lotes vencidos", CalendarX, "reference-icon-purple"],
            [expiring, "Lotes que vencen en 30 días", Clock3, "reference-icon-green"],
          ] as const
        ).map(([n, title, Icon, tone]) => (
          <Card key={title}>
            <CardContent className="flex items-center gap-5">
              <span className={`reference-icon ${tone}`}>
                <Icon />
              </span>
              <div>
                <p className="text-3xl font-semibold">{n}</p>
                <p className="mt-1 text-sm text-muted-foreground">{title}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <NativeSelect name="stock-site" label="Sede" options={siteNames} value={siteId} onChange={(e) => setSiteId(e.target.value)} />
          <div className="grid gap-1.5">
            <Label htmlFor="inventory-search">Buscar</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="inventory-search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                placeholder="Nombre o código"
                className="h-9 w-56 pl-8"
              />
            </div>
          </div>
          {view === "stock" && (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="inventory-category">Categoría</Label>
                <select id="inventory-category" value={category} onChange={(e) => { setCategory(e.target.value as ItemCategory | ""); setPage(0); }} className={selectClass}>
                  <option value="">Todas</option>
                  {Object.entries(ITEM_CATEGORIES).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="inventory-status">Estado</Label>
                <select id="inventory-status" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(0); }} className={selectClass}>
                  <option value="active">Activos</option>
                  <option value="inactive">Inactivos</option>
                  <option value="">Todos</option>
                </select>
              </div>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {view === "stock" && (
            <Button variant="outline" onClick={exportCsv}>
              <Download /> Descargar
            </Button>
          )}
          {canMove && (
            <Button variant="outline" onClick={() => setMoving("")} disabled={!sites.some((s) => s.id === siteId && s.active)}>
              <ArrowLeftRight /> Registrar movimiento
            </Button>
          )}
          {isAdmin && (
            <Button onClick={() => setEditing("new")}>
              <Plus /> Nuevo insumo o material
            </Button>
          )}
        </div>
      </div>
      {sites.length === 0 && <p className="text-sm text-muted-foreground">Crea una sede para registrar existencias.</p>}
      <FormError message={error} />

      {view === "stock" ? (
        <Card>
          <CardHeader>
            <CardTitle>
              Existencias · {siteNames[siteId] ?? "Sin sede"} <span className="text-sm font-normal text-muted-foreground">({items.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-xs text-muted-foreground">El disponible excluye lotes vencidos. El mínimo del catálogo se aplica a cada sede.</p>
            {shown.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No hay insumos ni materiales con esos filtros.{isAdmin && " Usa «Nuevo insumo o material» para agregar el primero."}
              </p>
            ) : (
              <Table pagination={false}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">Existencias</TableHead>
                    <TableHead className="text-right">Disponible</TableHead>
                    <TableHead className="text-right">Mínimo</TableHead>
                    <TableHead className="text-right">Costo unit.</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="w-0 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((i) => {
                    const batches = stock.filter((s) => s.itemId === i.id && s.quantity > 0);
                    const isLow = i.active && available(i.id) < i.minimum;
                    return (
                      <TableRow key={i.id} className={i.active ? undefined : "opacity-60"}>
                        <TableCell className="font-mono text-xs">{i.code}</TableCell>
                        <TableCell className="whitespace-normal">
                          <span className="font-medium">{i.name}</span>
                          {i.trackLots && batches.length > 0 && (
                            <span className="block text-xs text-muted-foreground">
                              {batches
                                .map(
                                  (b) =>
                                    `Lote ${b.lot}: ${qty(b.quantity)} · vence ${b.expiresOn ? date(b.expiresOn) : "—"}${b.expiresOn && b.expiresOn < today ? " (vencido)" : b.expiresOn && b.expiresOn <= soon ? " (por vencer)" : ""}`,
                                )
                                .join(" · ")}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{ITEM_CATEGORIES[i.category]}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {qty(total(i.id))} {i.unit}
                        </TableCell>
                        <TableCell className={isLow ? "text-right font-medium text-amber-700 tabular-nums" : "text-right tabular-nums"}>{qty(available(i.id))}</TableCell>
                        <TableCell className="text-right tabular-nums">{qty(i.minimum)}</TableCell>
                        <TableCell className="text-right tabular-nums">{i.unitCost === null ? "—" : formatCOP(i.unitCost)}</TableCell>
                        <TableCell>
                          {!i.active ? <Badge variant="outline">Inactivo</Badge> : isLow ? <Badge variant="destructive">Bajo el mínimo</Badge> : <Badge variant="secondary">Activo</Badge>}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            {canMove && i.active && (
                              <Button size="icon-sm" variant="ghost" title="Registrar movimiento" aria-label={`Movimiento de ${i.name}`} onClick={() => setMoving(i.id)}>
                                <ArrowLeftRight />
                              </Button>
                            )}
                            {isAdmin && (
                              <>
                                <Button size="icon-sm" variant="ghost" title="Editar" aria-label={`Editar ${i.name}`} onClick={() => setEditing(i)}>
                                  <Pencil />
                                </Button>
                                <Button size="icon-sm" variant="ghost" disabled={pending} title={i.active ? "Desactivar" : "Activar"} aria-label={i.active ? `Desactivar ${i.name}` : `Activar ${i.name}`} onClick={() => toggle(i)}>
                                  <Power className={i.active ? "" : "text-primary"} />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            <Pager page={current} pages={pages} onPage={setPage} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Historial de movimientos · {siteNames[siteId] ?? "Sin sede"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-xs text-muted-foreground">Últimos 200 movimientos de la clínica. Las correcciones se registran con otro movimiento.</p>
            {movements.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no hay movimientos en esta sede.</p>
            ) : (
              <Table pagination={false}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Movimiento</TableHead>
                    <TableHead>Insumo</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.slice(currentMovementPage * PAGE, currentMovementPage * PAGE + PAGE).map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-normal text-xs">
                        {formatDateTime(m.createdAt)}
                        <span className="block text-muted-foreground">{m.createdBy}</span>
                      </TableCell>
                      <TableCell>{historyKinds[m.kind] ?? m.kind}</TableCell>
                      <TableCell className="whitespace-normal">
                        {itemById[m.itemId]?.name}
                        {m.lot && <span className="block text-xs text-muted-foreground">Lote {m.lot}</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.delta > 0 ? "+" : ""}
                        {qty(m.delta)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{qty(m.balance)}</TableCell>
                      <TableCell className="whitespace-normal text-sm">
                        {m.reason}
                        {m.reference && <span className="block text-xs text-muted-foreground">Ref. {m.reference}</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <Pager page={currentMovementPage} pages={movementPages} onPage={setPage} />
          </CardContent>
        </Card>
      )}

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editing === "new" ? "Nuevo insumo o material" : `Editar · ${editing.name}`}</DialogTitle>
              <DialogDescription>Las existencias se registran después con un movimiento de entrada por sede.</DialogDescription>
            </DialogHeader>
            <ItemForm
              item={editing === "new" ? null : editing}
              onDone={() => {
                setEditing(null);
                router.refresh();
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {moving !== null && (
        <Dialog open onOpenChange={(o) => !o && setMoving(null)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Registrar movimiento</DialogTitle>
              <DialogDescription>Sede de origen: {siteNames[siteId] ?? "—"}</DialogDescription>
            </DialogHeader>
            <MovementForm
              data={data}
              sites={sites.filter((s) => s.active)}
              siteId={siteId}
              admin={isAdmin}
              initialItem={moving}
              onDone={() => {
                setMoving(null);
                router.refresh();
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Páginas" className="flex items-center justify-end gap-2 text-sm">
      <Button size="icon-sm" variant="outline" aria-label="Página anterior" disabled={page === 0} onClick={() => onPage(page - 1)}>
        <ChevronLeft />
      </Button>
      <span className="tabular-nums">
        Página {page + 1} de {pages}
      </span>
      <Button size="icon-sm" variant="outline" aria-label="Página siguiente" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
        <ChevronRight />
      </Button>
    </nav>
  );
}

function ItemForm({ item, onDone }: { item: InventoryItem | null; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setError(undefined);
        const cost = String(f.get("unitCost") ?? "").trim();
        start(async () => {
          const r = await saveInventoryItem(item?.id ?? null, {
            code: String(f.get("code")),
            name: String(f.get("name")),
            unit: String(f.get("unit")),
            minimum: Number(f.get("minimum")),
            trackLots: f.get("trackLots") === "on",
            active: f.get("active") === "on",
            category: String(f.get("category")) as ItemCategory,
            unitCost: cost === "" ? null : Number(cost),
          });
          if (!r.ok) setError(r.error);
          else onDone();
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="inventory-category-field">Categoría *</Label>
          <select id="inventory-category-field" name="category" defaultValue={item?.category ?? "SUPPLY"} className={`${selectClass} w-full`}>
            {Object.entries(ITEM_CATEGORIES).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <Field name="code" label="Código interno *" required maxLength={40} pattern="[A-Za-z0-9_\-]+" defaultValue={item?.code} />
        <Field name="name" label="Nombre *" required maxLength={150} defaultValue={item?.name} className="sm:col-span-2" />
        <Field name="unit" label="Unidad (unidad, ml, g…) *" required maxLength={30} defaultValue={item?.unit ?? "unidad"} />
        <Field name="minimum" label="Stock mínimo por sede *" type="number" min="0" step="0.001" required defaultValue={item?.minimum ?? 0} />
        <Field name="unitCost" label="Costo unitario (COP)" type="number" min="0" step="0.01" defaultValue={item?.unitCost ?? ""} />
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="trackLots" defaultChecked={item?.trackLots ?? false} className="size-4 accent-primary" />
          Controlar lote y vencimiento
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="active" defaultChecked={item?.active ?? true} className="size-4 accent-primary" />
          Activo
        </label>
      </div>
      <p className="text-xs text-muted-foreground">Usa siempre la misma unidad. Una caja de 100 unidades se registra como 100 si la unidad es «unidad».</p>
      <FormError message={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button disabled={pending}>{pending ? "Guardando…" : item ? "Guardar cambios" : "Crear"}</Button>
      </div>
    </form>
  );
}

function MovementForm({
  data,
  sites,
  siteId,
  admin,
  initialItem,
  onDone,
}: {
  data: InventoryOverview;
  sites: Site[];
  siteId: string;
  admin: boolean;
  initialItem: string;
  onDone: () => void;
}) {
  const [itemId, setItemId] = useState(initialItem);
  const [kind, setKind] = useState<MovementKind>("ENTRY");
  const [batchId, setBatchId] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [operationId, setOperationId] = useState<string | null>(null);
  const item = data.items.find((i) => i.id === itemId);
  const existing = kind !== "ENTRY" && kind !== "ADJUSTMENT";
  const batches = data.stock.filter((s) => s.itemId === itemId && s.siteId === siteId && s.quantity > 0);
  const selectedBatch = batches.find((b) => b.batchId === batchId);
  const kinds = admin ? MOVEMENT_KINDS : Object.fromEntries(Object.entries(MOVEMENT_KINDS).filter(([k]) => k !== "ADJUSTMENT"));
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setError(undefined);
        if (!item) return setError("Selecciona un insumo");
        if (existing && item.trackLots && !selectedBatch) return setError("Selecciona el lote de origen");
        const key = operationId ?? crypto.randomUUID();
        setOperationId(key);
        start(async () => {
          const r = await registerInventoryMovement({
            operationId: key,
            itemId,
            siteId,
            kind,
            quantity: Number(f.get("quantity")),
            lot: item.trackLots ? (existing ? selectedBatch!.lot : String(f.get("lot"))) : null,
            expiresOn: item.trackLots ? (existing ? selectedBatch!.expiresOn : String(f.get("expiresOn"))) : null,
            destinationSiteId: kind === "TRANSFER" ? String(f.get("destination")) : null,
            reason: String(f.get("reason")),
            reference: String(f.get("reference") ?? "") || null,
          });
          if (!r.ok) setError(r.error);
          else onDone();
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="movement-item">Insumo o material *</Label>
          <SearchableSelect
            id="movement-item"
            options={data.items.filter((i) => i.active).map((i) => ({ value: i.id, label: `${i.code} · ${i.name}`, hint: ITEM_CATEGORIES[i.category] }))}
            value={itemId}
            onChange={(v) => {
              setItemId(v);
              setBatchId("");
            }}
          />
        </div>
        <NativeSelect name="movement-kind" label="Tipo de movimiento" options={kinds} value={kind} onChange={(e) => { setKind(e.target.value as MovementKind); setBatchId(""); }} />
        <Field
          name="quantity"
          label={kind === "ADJUSTMENT" ? "Diferencia (+ entrada / − salida)" : `Cantidad${item ? ` (${item.unit})` : ""}`}
          type="number"
          min={kind === "ADJUSTMENT" ? undefined : "0.001"}
          step="0.001"
          required
        />
        {item?.trackLots &&
          (existing ? (
            <NativeSelect
              name="batch"
              label="Lote de origen"
              options={Object.fromEntries(batches.map((b) => [b.batchId, `${b.lot} · ${qty(b.quantity)} · Vence ${b.expiresOn ? date(b.expiresOn) : "—"}`]))}
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              placeholder="Selecciona un lote"
              required
            />
          ) : (
            <>
              <Field name="lot" label="Lote" required maxLength={80} />
              <Field name="expiresOn" label="Vencimiento" type="date" required />
            </>
          ))}
        {kind === "TRANSFER" && (
          <NativeSelect name="destination" label="Sede de destino" options={Object.fromEntries(sites.filter((s) => s.id !== siteId).map((s) => [s.id, s.name]))} placeholder="Selecciona una sede" required />
        )}
        <Field name="reference" label="Referencia (compra, remisión…)" maxLength={100} />
        <Field name="reason" label="Motivo *" required minLength={3} maxLength={300} />
      </div>
      {kind === "ADJUSTMENT" && <p className="text-xs text-muted-foreground">Registra la diferencia entre el conteo físico y el saldo actual, con el motivo.</p>}
      <FormError message={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button disabled={pending}>{pending ? "Registrando…" : "Registrar movimiento"}</Button>
      </div>
    </form>
  );
}

function Field({ label, name, className, ...props }: React.ComponentProps<typeof Input> & { label: string; name: string }) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={`inventory-${name}`}>{label}</Label>
      <Input id={`inventory-${name}`} name={name} {...props} />
    </div>
  );
}
