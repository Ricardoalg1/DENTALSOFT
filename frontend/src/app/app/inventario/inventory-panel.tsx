"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { FormError } from "@/components/form-error";
import { formatDateTime } from "@/lib/format";
import { MOVEMENT_KINDS, type InventoryItem, type InventoryOverview, type MovementKind } from "@/lib/inventory";
import type { Site, Role } from "@/lib/types";
import { registerInventoryMovement, saveInventoryItem } from "./actions";

const qty = (n: number) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(n);
const date = (s: string) => s.split("-").reverse().join("/");
const historyKinds: Record<string, string> = { ...MOVEMENT_KINDS, TRANSFER_OUT: "Salida por traslado", TRANSFER_IN: "Entrada por traslado" };

export function InventoryPanel({ data, sites, role, today }: { data: InventoryOverview; sites: Site[]; role: Role; today: string }) {
  const [siteId, setSiteId] = useState(sites.find(s => s.active)?.id ?? sites[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [tab, setTab] = useState<"stock" | "movements">("stock");
  const canMove = role === "ADMIN" || role === "ASSISTANT";
  const siteNames = Object.fromEntries(sites.map(s => [s.id, s.name]));
  const itemNames = Object.fromEntries(data.items.map(i => [i.id, i.name]));
  const expiryLimit = new Date(`${today}T12:00:00Z`); expiryLimit.setUTCDate(expiryLimit.getUTCDate() + 30);
  const soon = expiryLimit.toISOString().slice(0, 10);
  const stock = data.stock.filter(s => s.siteId === siteId);
  const items = data.items.filter(i => (showArchived || i.active) && `${i.name} ${i.code}`.toLowerCase().includes(search.toLowerCase()));
  const available = (id: string) => stock.filter(s => s.itemId === id && (!s.expiresOn || s.expiresOn >= today)).reduce((sum, s) => sum + s.quantity, 0);
  const low = data.items.filter(i => i.active && available(i.id) < i.minimum).length;
  const expired = stock.filter(s => s.quantity > 0 && s.expiresOn && s.expiresOn < today).length;
  const expiring = stock.filter(s => s.quantity > 0 && s.expiresOn && s.expiresOn >= today && s.expiresOn <= soon).length;
  return <div className="mx-auto grid max-w-6xl gap-6">
    <header><h1 className="text-2xl font-semibold tracking-tight">Inventario</h1><p className="text-muted-foreground">Insumos, lotes y movimientos por sede.</p></header>
    <div className="flex flex-wrap items-end gap-4">
      <NativeSelect name="stock-site" label="Sede" options={siteNames} value={siteId} onChange={e => setSiteId(e.target.value)} />
      <div className="grid gap-1.5"><Label htmlFor="inventory-search">Buscar insumo</Label><Input id="inventory-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre o código" /></div>
      <label className="flex items-center gap-2 pb-1 text-sm"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />Mostrar inactivos</label>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">{[[low, "Insumos bajo el mínimo"], [expired, "Lotes vencidos"], [expiring, "Lotes que vencen en 30 días"]].map(([n, title]) => <Card key={title}><CardContent className="pt-4"><p className="text-2xl font-semibold">{n}</p><p className="text-sm text-muted-foreground">{title}</p></CardContent></Card>)}</div>
    {sites.length === 0 && <p className="text-sm text-muted-foreground">Crea una sede para registrar existencias.</p>}
    <div className="flex gap-2"><Button variant={tab === "stock" ? "default" : "outline"} onClick={() => setTab("stock")}>Existencias</Button><Button variant={tab === "movements" ? "default" : "outline"} onClick={() => setTab("movements")}>Historial</Button></div>
    {tab === "stock" ? <Card><CardHeader><CardTitle>Existencias · {siteNames[siteId] ?? "Sin sede"}</CardTitle></CardHeader><CardContent className="grid gap-4">
      <p className="text-xs text-muted-foreground">El saldo disponible excluye lotes vencidos. El mínimo del catálogo se aplica a cada sede.</p>
      {items.length === 0 && <p className="text-sm text-muted-foreground">No hay insumos para mostrar.</p>}
      {items.map(i => {
        const batches = stock.filter(s => s.itemId === i.id);
        const total = batches.reduce((sum, s) => sum + s.quantity, 0);
        return <div key={i.id} className="grid gap-3 rounded-xl border p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium">{i.name} {!i.active && <span className="text-xs text-muted-foreground">· Inactivo</span>}</p><p className="text-xs text-muted-foreground">{i.code} · {i.unit} · Mínimo {qty(i.minimum)}</p></div><div className="text-right"><p className="font-medium">{qty(total)} {i.unit}</p><p className={available(i.id) < i.minimum ? "text-sm text-amber-700" : "text-xs text-muted-foreground"}>Disponible: {qty(available(i.id))}{available(i.id) < i.minimum && " · Bajo el mínimo"}</p></div></div>
          {i.trackLots && <ul className="grid gap-1 text-sm">{batches.map(b => <li key={b.batchId} className="flex flex-wrap justify-between gap-2"><span>Lote {b.lot} · Vence {b.expiresOn ? date(b.expiresOn) : "Sin fecha"}{b.quantity > 0 && b.expiresOn && b.expiresOn < today ? " · Vencido" : b.quantity > 0 && b.expiresOn && b.expiresOn <= soon ? " · Próximo a vencer" : ""}</span><span>{qty(b.quantity)} {i.unit}</span></li>)}</ul>}
          {role === "ADMIN" && <Button variant="outline" size="sm" className="w-fit" onClick={() => setEditing(i)}>Editar insumo</Button>}
        </div>;
      })}
    </CardContent></Card> : <Card><CardHeader><CardTitle>Historial de movimientos</CardTitle></CardHeader><CardContent className="grid gap-3">
      <p className="text-xs text-muted-foreground">Últimos 200 movimientos de la clínica, filtrados por sede y búsqueda. Las correcciones se registran mediante otro movimiento.</p>
      {data.movements.filter(m => m.siteId === siteId && `${itemNames[m.itemId] ?? ""} ${data.items.find(i => i.id === m.itemId)?.code ?? ""}`.toLowerCase().includes(search.toLowerCase())).map(m => <div key={m.id} className="grid gap-1 rounded-lg border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{historyKinds[m.kind] ?? m.kind} · {itemNames[m.itemId]}</p><p>{m.delta > 0 ? "+" : ""}{qty(m.delta)} · Saldo {qty(m.balance)}</p></div><p>{m.reason}{m.reference && ` · Ref. ${m.reference}`}{m.lot && ` · Lote ${m.lot}`}</p><p className="text-xs text-muted-foreground">{formatDateTime(m.createdAt)} · {m.createdBy}</p></div>)}
      {!data.movements.some(m => m.siteId === siteId) && <p className="text-sm text-muted-foreground">Aún no hay movimientos en esta sede.</p>}
    </CardContent></Card>}
    {canMove && <Card><CardHeader><CardTitle>Registrar movimiento</CardTitle></CardHeader><CardContent><MovementForm data={data} sites={sites.filter(s => s.active)} siteId={siteId} admin={role === "ADMIN"} /></CardContent></Card>}
    {role === "ADMIN" && <Card><CardHeader><CardTitle>{editing ? `Editar · ${editing.name}` : "Agregar insumo"}</CardTitle></CardHeader><CardContent><ItemForm key={editing?.id ?? "new"} item={editing} onDone={() => setEditing(null)} />{editing && <Button className="mt-3" variant="ghost" onClick={() => setEditing(null)}>Cancelar edición</Button>}</CardContent></Card>}
  </div>;
}

function ItemForm({ item, onDone }: { item: InventoryItem | null; onDone: () => void }) {
  const [pending, start] = useTransition(); const [error, setError] = useState<string>(); const [saved, setSaved] = useState(false); const router = useRouter();
  return <form className="grid gap-3" onSubmit={e => {
    e.preventDefault(); const el = e.currentTarget; const f = new FormData(el); setError(undefined); setSaved(false);
    start(async () => { const r = await saveInventoryItem(item?.id ?? null, { code: String(f.get("code")), name: String(f.get("name")), unit: String(f.get("unit")), minimum: Number(f.get("minimum")), trackLots: f.get("trackLots") === "on", active: f.get("active") === "on" }); if (!r.ok) setError(r.error); else { setSaved(true); if (!item) el.reset(); onDone(); router.refresh(); } });
  }}>
    <div className="grid gap-3 sm:grid-cols-2"><Field name="code" label="Código interno" required maxLength={40} pattern="[A-Za-z0-9_-]+" defaultValue={item?.code} /><Field name="name" label="Nombre del insumo" required maxLength={150} defaultValue={item?.name} /><Field name="unit" label="Unidad (unidad, ml, g…)" required maxLength={30} defaultValue={item?.unit ?? "unidad"} /><Field name="minimum" label="Stock mínimo por sede" type="number" min="0" step="0.001" required defaultValue={item?.minimum ?? 0} /></div>
    <div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" name="trackLots" defaultChecked={item?.trackLots ?? false} />Controlar lote y vencimiento</label><label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={item?.active ?? true} />Activo</label></div>
    <p className="text-xs text-muted-foreground">Usa siempre la misma unidad. Una caja de 100 unidades se registra como 100 si la unidad es «unidad».</p>
    <FormError message={error} />{saved && <p className="text-sm text-primary">Insumo guardado.</p>}<Button className="w-fit" disabled={pending}>{pending ? "Guardando…" : item ? "Guardar cambios" : "Agregar insumo"}</Button>
  </form>;
}

function MovementForm({ data, sites, siteId, admin }: { data: InventoryOverview; sites: Site[]; siteId: string; admin: boolean }) {
  const [itemId, setItemId] = useState(""); const [kind, setKind] = useState<MovementKind>("ENTRY");
  const [batchId, setBatchId] = useState(""); const [pending, start] = useTransition(); const [error, setError] = useState<string>(); const [saved, setSaved] = useState(false);
  const [operationId, setOperationId] = useState<string | null>(null); const router = useRouter();
  const item = data.items.find(i => i.id === itemId);
  const existing = kind !== "ENTRY" && kind !== "ADJUSTMENT";
  const batches = data.stock.filter(s => s.itemId === itemId && s.siteId === siteId && s.quantity > 0);
  const selectedBatch = batches.find(b => b.batchId === batchId);
  const kinds = admin ? MOVEMENT_KINDS : Object.fromEntries(Object.entries(MOVEMENT_KINDS).filter(([k]) => k !== "ADJUSTMENT"));
  return <form className="grid gap-3" onSubmit={e => {
    e.preventDefault(); const el = e.currentTarget; const f = new FormData(el); setError(undefined); setSaved(false);
    if (!item) return setError("Selecciona un insumo");
    if (existing && item.trackLots && !selectedBatch) return setError("Selecciona el lote de origen");
    const key = operationId ?? crypto.randomUUID(); setOperationId(key);
    start(async () => { const r = await registerInventoryMovement({ operationId: key, itemId, siteId, kind, quantity: Number(f.get("quantity")), lot: item.trackLots ? (existing ? selectedBatch!.lot : String(f.get("lot"))) : null, expiresOn: item.trackLots ? (existing ? selectedBatch!.expiresOn : String(f.get("expiresOn"))) : null, destinationSiteId: kind === "TRANSFER" ? String(f.get("destination")) : null, reason: String(f.get("reason")), reference: String(f.get("reference") ?? "") || null }); if (!r.ok) setError(r.error); else { setSaved(true); setOperationId(null); el.reset(); setBatchId(""); router.refresh(); } });
  }}>
    <p className="text-sm text-muted-foreground">Sede de origen: {sites.find(s => s.id === siteId)?.name ?? "Selecciona una sede activa"}</p>
    <div className="grid gap-3 sm:grid-cols-2"><NativeSelect name="movement-item" label="Insumo" options={Object.fromEntries(data.items.filter(i => i.active).map(i => [i.id, `${i.code} · ${i.name}`]))} placeholder="Selecciona un insumo" value={itemId} onChange={e => { setItemId(e.target.value); setBatchId(""); }} required /><NativeSelect name="movement-kind" label="Tipo de movimiento" options={kinds} value={kind} onChange={e => { setKind(e.target.value as MovementKind); setBatchId(""); }} /><Field name="quantity" label={kind === "ADJUSTMENT" ? "Diferencia (+ entrada / − salida)" : `Cantidad${item ? ` (${item.unit})` : ""}`} type="number" min={kind === "ADJUSTMENT" ? undefined : "0.001"} step="0.001" required />
    {item?.trackLots && (existing ? <NativeSelect name="batch" label="Lote de origen" options={Object.fromEntries(batches.map(b => [b.batchId, `${b.lot} · ${qty(b.quantity)} · Vence ${b.expiresOn ? date(b.expiresOn) : "—"}`]))} value={batchId} onChange={e => setBatchId(e.target.value)} placeholder="Selecciona un lote" required /> : <><Field name="lot" label="Lote" required maxLength={80} /><Field name="expiresOn" label="Vencimiento" type="date" required /></>)}
    {kind === "TRANSFER" && <NativeSelect name="destination" label="Sede de destino" options={Object.fromEntries(sites.filter(s => s.id !== siteId).map(s => [s.id, s.name]))} placeholder="Selecciona una sede" required />}
    <Field name="reference" label="Referencia (compra, remisión…)" maxLength={100} /><Field name="reason" label="Motivo" required minLength={3} maxLength={300} /></div>
    {kind === "ADJUSTMENT" && <p className="text-xs text-muted-foreground">Registra la diferencia entre el conteo físico y el saldo actual, con el motivo de la corrección.</p>}
    <FormError message={error} />{saved && <p className="text-sm text-primary">Movimiento registrado.</p>}<Button disabled={pending || !sites.some(s => s.id === siteId)} className="w-fit">{pending ? "Registrando…" : "Registrar movimiento"}</Button>
  </form>;
}

function Field({ label, name, ...props }: React.ComponentProps<typeof Input> & { label: string; name: string }) {
  return <div className="grid gap-1.5"><Label htmlFor={`inventory-${name}`}>{label}</Label><Input id={`inventory-${name}`} name={name} {...props} /></div>;
}
