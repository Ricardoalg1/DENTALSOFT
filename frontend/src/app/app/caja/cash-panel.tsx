"use client";
import { EmptyState } from "@/components/app/reference-art";
import { SectionIcon } from "@/components/app/section-icon";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form-error";
import { NativeSelect } from "@/components/native-select";
import { formatCOP, formatDateTime, formatReceipt } from "@/lib/format";
import { PAYMENT_METHODS, type CashSession, type Payment, type Site } from "@/lib/types";
import { closeCash, openCash } from "./actions";

export function CashPanel({ sessions, sites, canManage }: { sessions: CashSession[]; sites: Site[]; canManage: boolean }) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const open = sessions.filter((s) => !s.closedAt);
  const availableSites = sites.filter(s => !open.some(o => o.site?.id === s.id));
  const [siteId, setSiteId] = useState(availableSites[0]?.id ?? "");
  const selectedSiteId = availableSites.some(s => s.id === siteId) ? siteId : availableSites[0]?.id ?? "";

  function submitOpen(form: FormData) {
    setError(undefined);
    startTransition(async () => {
      const result = await openCash({ siteId: String(form.get("siteId")), openingAmount: Number(form.get("openingAmount")) });
      if (!result.ok) setError(result.error);
    });
  }

  function submitClose(id: string, form: FormData) {
    setError(undefined);
    startTransition(async () => {
      const result = await closeCash(id, { countedCash: Number(form.get("countedCash")), notes: String(form.get("notes") ?? "") || undefined });
      if (!result.ok) setError(result.error);
    });
  }

  return <div className="grid gap-6">
    <FormError message={error} />
    {canManage && <section className="reference-panel grid gap-4">
      <h2 className="flex items-center gap-5 text-xl font-semibold"><SectionIcon title="Abrir caja" />Abrir caja</h2>
      {sites.length === 0 ? <p className="text-sm text-muted-foreground">Crea una sede antes de abrir caja.</p> : availableSites.length === 0 ? <p className="text-sm text-muted-foreground">Todas las sedes activas ya tienen una caja abierta.</p> : <form action={submitOpen} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <NativeSelect name="siteId" id="cash-site" label="Sede" options={Object.fromEntries(availableSites.map(s => [s.id, s.name]))} value={selectedSiteId} onChange={e => setSiteId(e.target.value)} />
        <div className="grid gap-1.5"><Label htmlFor="opening">Base inicial (COP)</Label><Input id="opening" name="openingAmount" type="number" min="0" step="0.01" required defaultValue="0" /></div>
        <Button disabled={pending || !selectedSiteId}>Abrir turno</Button>
      </form>}
    </section>}
    <section className="reference-panel grid gap-3">
      <h2 className="flex items-center gap-5 text-xl font-semibold"><SectionIcon title="Turnos abiertos" />Turnos abiertos</h2>
      {open.length === 0 && <EmptyState compact kind="cash" title="No hay cajas abiertas." description="Cuando abras una caja, aquí verás los turnos en curso por sede." />}
      {open.map(s => <SessionCard key={s.id} session={s} canManage={canManage} pending={pending} onClose={form => submitClose(s.id, form)} />)}
    </section>
    <section className="reference-panel grid gap-3">
      <h2 className="flex items-center gap-5 text-xl font-semibold"><SectionIcon title="Turnos recientes" />Turnos recientes</h2>
      {sessions.filter(s => s.closedAt).length === 0 && <EmptyState compact kind="closed" title="Aún no hay turnos cerrados." description="Los turnos que cierres se mostrarán aquí con su fecha, sede y recaudos." />}
      {sessions.filter(s => s.closedAt).map(s => <SessionCard key={s.id} session={s} canManage={false} pending={pending} onClose={() => {}} />)}
    </section>
  </div>;
}

function SessionCard({ session: s, canManage, pending, onClose }: { session: CashSession; canManage: boolean; pending: boolean; onClose: (form: FormData) => void }) {
  return <article className="grid gap-3 rounded-xl border p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-medium">{s.site?.name ?? "Sede"} · {s.closedAt ? "Cerrada" : "Abierta"}</h3><p className="text-xs text-muted-foreground">Abrió {s.openedBy?.name ?? "—"} · {formatDateTime(s.openedAt)}{s.closedAt && ` · Cerró ${s.closedBy?.name ?? "—"} · ${formatDateTime(s.closedAt)}`}</p></div><span className="font-semibold tabular-nums">{formatCOP(s.collected)} recaudado</span></div>
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">{s.totals.map(t => <span key={t.method}>{PAYMENT_METHODS[t.method]}: {formatCOP(t.total)} ({t.count})</span>)}<span>Base: {formatCOP(s.openingAmount)}</span></div>
    {s.closedAt && <p className="text-sm">Efectivo esperado {formatCOP(s.expectedCash)} · contado {formatCOP(s.countedCash ?? 0)} · diferencia <strong>{formatCOP(s.difference ?? 0)}</strong></p>}
    {s.payments?.map(p => <PaymentLine key={p.id} payment={p} />)}
    {!s.closedAt && canManage && <form action={onClose} className="grid gap-3 border-t pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><div className="grid gap-1.5"><Label htmlFor={`count-${s.id}`}>Efectivo contado (COP)</Label><Input id={`count-${s.id}`} name="countedCash" required type="number" min="0" step="0.01" defaultValue={String(s.expectedCash)} /></div><div className="grid gap-1.5"><Label htmlFor={`notes-${s.id}`}>Nota de cierre</Label><Input id={`notes-${s.id}`} name="notes" maxLength={500} /></div><Button variant="outline" disabled={pending}>Cerrar caja</Button></form>}
  </article>;
}

function PaymentLine({ payment: p }: { payment: Payment }) {
  return <div className="flex flex-wrap justify-between gap-2 border-t pt-2 text-sm"><span><Link className="text-primary hover:underline" href={`/app/caja/recibos/${p.id}`}>Recibo N.º {formatReceipt(p.receiptNumber)}</Link> · {p.patient.name} · {PAYMENT_METHODS[p.method]} · {formatDateTime(p.receivedAt)}{p.voidedAt && " · ANULADO"}</span><span className="tabular-nums">{formatCOP(p.amount)}</span></div>;
}
