import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, getMe } from "@/lib/api";
import { formatCOP, formatDate } from "@/lib/format";
import { canCollect, canManageCash, FINANCING_STATUS, type Financing, type FinancingStatus } from "@/lib/types";
import { STATUS_VARIANT } from "./status";

export const metadata: Metadata = { title: "Financiamiento" };


export default async function FinancingPage({ searchParams }: PageProps<"/app/financiamiento">) {
  const me = await getMe();
  if (!canCollect(me)) redirect("/app");
  const sp = await searchParams;
  const status = typeof sp.estado === "string" && sp.estado in FINANCING_STATUS ? (sp.estado as FinancingStatus) : "";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 120) : "";
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  const list = await api<Financing[]>(`/api/financings?${params}`);
  const active = list.filter((f) => f.status === "ACTIVE" || f.status === "OVERDUE");
  const portfolio = active.reduce((s, f) => s + f.balance, 0);
  const overdue = active.reduce((s, f) => s + f.overdue, 0);

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Financiamiento</h1>
          <p className="text-muted-foreground">Acuerdos de pago a cuotas (sin intereses). Las cuotas se pagan como abonos en Recaudos.</p>
        </div>
        {canManageCash(me) && (
          <Link href="/app/financiamiento/nuevo" className={buttonVariants()}>
            <Plus /> Nuevo financiamiento
          </Link>
        )}
      </header>

      <dl className="grid gap-3 sm:grid-cols-3">
        <Stat label="Acuerdos vigentes" value={String(active.length)} />
        <Stat label="Saldo por cobrar" value={formatCOP(portfolio)} />
        <Stat label="En mora" value={formatCOP(overdue)} danger={overdue > 0} />
      </dl>

      <Card>
        <CardHeader>
          <CardTitle>Acuerdos</CardTitle>
          <CardDescription>{list.length} {list.length === 1 ? "acuerdo" : "acuerdos"}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form action="/app/financiamiento" className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="estado">Estado</Label>
              <select id="estado" name="estado" defaultValue={status} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30">
                <option value="">Todos</option>
                {Object.entries(FINANCING_STATUS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="q">Buscar</Label>
              <Input id="q" name="q" defaultValue={q} placeholder="Paciente, documento o concepto" />
            </div>
            <Button type="submit" variant="outline">
              Filtrar
            </Button>
          </form>
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay acuerdos con esos filtros.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Próxima cuota</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="whitespace-normal">
                      <Link href={`/app/financiamiento/${f.id}`} className="font-medium text-primary hover:underline">
                        {f.patient.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{f.patientDocument}</span>
                    </TableCell>
                    <TableCell className="whitespace-normal">{f.concept}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[f.status]}>{FINANCING_STATUS[f.status]}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{f.nextDue ? formatDate(f.nextDue) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCOP(f.totalAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCOP(f.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={danger ? "text-xl font-semibold text-destructive tabular-nums" : "text-xl font-semibold tabular-nums"}>{value}</dd>
    </div>
  );
}
