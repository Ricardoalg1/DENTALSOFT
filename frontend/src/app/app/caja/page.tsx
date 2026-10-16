import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { PaginationLinks } from "@/components/pagination-links";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, getMe } from "@/lib/api";
import { todayCO } from "@/lib/agenda-time";
import { formatCOP, formatDate, formatReceipt } from "@/lib/format";
import { canManageCash, PAYMENT_KINDS, PAYMENT_METHODS, type CashSession, type Page, type Payment, type Site } from "@/lib/types";
import { CashPanel } from "./cash-panel";

export const metadata: Metadata = { title: "Recaudos" };

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function CashPage({ searchParams }: PageProps<"/app/caja">) {
  const me = await getMe();
  if (me.role === "ASSISTANT") redirect("/app");
  const sp = await searchParams;
  const today = todayCO();
  const from = isDate(sp.desde) ? sp.desde : today;
  const to = isDate(sp.hasta) ? sp.hasta : today;
  const kind = sp.tipo === "SALE" || sp.tipo === "ACCOUNT" ? sp.tipo : "";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 120) : "";
  const page = Math.max(0, Math.trunc(Number(sp.page) || 0));
  const manage = canManageCash(me);

  const params = new URLSearchParams({ from, to, page: String(page), size: "20" });
  if (kind) params.set("kind", kind);
  if (q) params.set("q", q);
  const [sessions, sites, incomes] = await Promise.all([
    api<CashSession[]>("/api/cash-sessions"),
    api<Site[]>("/api/sites"),
    manage ? api<Page<Payment>>(`/api/payments?${params}`) : null,
  ]);
  const href = (p: number) => {
    const u = new URLSearchParams({ desde: from, hasta: to, page: String(p) });
    if (kind) u.set("tipo", kind);
    if (q) u.set("q", q);
    return `/app/caja?${u}`;
  };
  const shownTotal = incomes?.content.filter((p) => !p.voidedAt).reduce((s, p) => s + p.amount, 0) ?? 0;

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Recaudos</h1>
          <p className="text-muted-foreground">Ingresos de pacientes, turnos de caja por sede y cierres.</p>
        </div>
        <Link href="/app/caja/nuevo" className={buttonVariants()}>
          <Plus /> Nuevo ingreso
        </Link>
      </header>

      {incomes && (
        <Card>
          <CardHeader>
            <CardTitle>Ingresos</CardTitle>
            <CardDescription>
              {incomes.totalElements} {incomes.totalElements === 1 ? "ingreso" : "ingresos"}
              {from === to ? ` el ${formatDate(from)}` : ` del ${formatDate(from)} al ${formatDate(to)}`}
              {incomes.totalPages <= 1 && ` · ${formatCOP(shownTotal)} recaudado (sin anulados)`}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {/* Formulario GET: los filtros quedan en la URL. */}
            <form action="/app/caja" className="grid gap-3 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto] sm:items-end">
              <div className="grid gap-1.5">
                <Label htmlFor="desde">Desde</Label>
                <Input id="desde" name="desde" type="date" defaultValue={from} max={today} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="hasta">Hasta</Label>
                <Input id="hasta" name="hasta" type="date" defaultValue={to} max={today} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tipo">Tipo</Label>
                <select
                  id="tipo"
                  name="tipo"
                  defaultValue={kind}
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
                >
                  <option value="">Todos</option>
                  {Object.entries(PAYMENT_KINDS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="q">Buscar</Label>
                <Input id="q" name="q" defaultValue={q} placeholder="Paciente, documento, recibo…" />
              </div>
              <Button type="submit" variant="outline">
                Filtrar
              </Button>
            </form>

            {incomes.content.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay ingresos con esos filtros.</p>
            ) : (
              <Table pagination={false}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recibo</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Sede</TableHead>
                    <TableHead>Medio</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incomes.content.map((p) => (
                    <TableRow key={p.id} className={p.voidedAt ? "opacity-60" : undefined}>
                      <TableCell>
                        <Link href={`/app/caja/recibos/${p.id}`} className="font-medium text-primary tabular-nums hover:underline">
                          {formatReceipt(p.receiptNumber)}
                        </Link>
                      </TableCell>
                      <TableCell className="tabular-nums">{formatDate(p.incomeDate)}</TableCell>
                      <TableCell className="whitespace-normal">
                        {p.patient.name}
                        {p.payerName && <span className="block text-xs text-muted-foreground">A nombre de {p.payerName}</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.kind === "SALE" ? "secondary" : "outline"}>{PAYMENT_KINDS[p.kind]}</Badge>
                        {p.voidedAt && <Badge variant="destructive" className="ml-1">Anulado</Badge>}
                      </TableCell>
                      <TableCell>{p.site.name}</TableCell>
                      <TableCell>{PAYMENT_METHODS[p.method]}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCOP(p.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <PaginationLinks page={incomes.page} pages={incomes.totalPages} total={incomes.totalElements} href={href} />
          </CardContent>
        </Card>
      )}

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Turnos de caja</h2>
        <CashPanel sessions={sessions} sites={sites.filter((s) => s.active)} canManage={manage} />
      </section>
    </div>
  );
}
