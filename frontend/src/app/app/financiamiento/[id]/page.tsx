import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, ApiError, getMe } from "@/lib/api";
import { formatCOP, formatDate, formatDateTime, formatReceipt } from "@/lib/format";
import {
  canManageCash,
  FINANCING_FREQUENCIES,
  FINANCING_STATUS,
  INSTALLMENT_STATUS,
  PAYMENT_METHODS,
  type CashSession,
  type Financing,
  type Payment,
} from "@/lib/types";
import { INSTALLMENT_VARIANT, STATUS_VARIANT } from "../status";
import { CancelFinancing, PayInstallment } from "./pay-installment";

export const metadata: Metadata = { title: "Financiamiento" };

export default async function FinancingDetailPage({ params }: PageProps<"/app/financiamiento/[id]">) {
  const { id } = await params;
  const me = await getMe();
  let f: Financing;
  try {
    f = await api<Financing>(`/api/financings/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
  const [payments, sessions] = await Promise.all([
    api<Payment[]>(`/api/patients/${f.patient.id}/payments`),
    api<CashSession[]>("/api/cash-sessions"),
  ]);
  const own = payments.filter((p) => p.financingId === f.id);
  const openSites = sessions.filter((s) => !s.closedAt).map((s) => ({ id: s.site.id, name: s.site.name }));
  const next = f.schedule.find((s) => s.status !== "PAID");
  const live = f.status !== "CANCELLED" && f.status !== "PAID";

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <Link href="/app/financiamiento" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Financiamiento
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            {f.concept} <Badge variant={STATUS_VARIANT[f.status]}>{FINANCING_STATUS[f.status]}</Badge>
          </h1>
          <p className="text-muted-foreground">
            <Link href={`/app/pacientes/${f.patient.id}`} className="text-primary hover:underline">
              {f.patient.name}
            </Link>{" "}
            · {f.patientDocument} · {f.installments} cuotas {FINANCING_FREQUENCIES[f.frequency].toLowerCase()}es · creado por{" "}
            {f.createdBy?.name ?? "—"} el {formatDateTime(f.createdAt)}
          </p>
          {f.cancelledAt && (
            <p className="text-sm text-destructive">
              Cancelado por {f.cancelledBy?.name ?? "—"} el {formatDateTime(f.cancelledAt)}: {f.cancelReason}
            </p>
          )}
        </div>
        {me.role === "ADMIN" && f.status !== "CANCELLED" && <CancelFinancing id={f.id} />}
      </header>

      <dl className="grid gap-3 sm:grid-cols-4">
        {[
          ["Total", formatCOP(f.totalAmount)],
          ["Pagado", formatCOP(f.paid)],
          ["Saldo", formatCOP(f.balance)],
          ["En mora", formatCOP(f.overdue)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-card px-4 py-3">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className={label === "En mora" && f.overdue > 0 ? "text-xl font-semibold text-destructive tabular-nums" : "text-xl font-semibold tabular-nums"}>{value}</dd>
          </div>
        ))}
      </dl>

      {live && canManageCash(me) && (
        <Card>
          <CardHeader>
            <CardTitle>Registrar pago de cuotas</CardTitle>
            <CardDescription>Se registra como abono en Recaudos y se aplica a las cuotas en orden de vencimiento.</CardDescription>
          </CardHeader>
          <CardContent>
            <PayInstallment financingId={f.id} patientId={f.patient.id} sites={openSites} suggested={next ? next.amount - next.paid : f.balance} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Plan de cuotas</CardTitle>
          {f.notes && <CardDescription>{f.notes}</CardDescription>}
        </CardHeader>
        <CardContent>
          <Table pagination={false}>
            <TableHeader>
              <TableRow>
                <TableHead>Cuota</TableHead>
                <TableHead>Vence</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Pagado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {f.schedule.map((s) => (
                <TableRow key={s.number}>
                  <TableCell>{s.number === 0 ? "Cuota inicial" : `Cuota ${s.number}`}</TableCell>
                  <TableCell className="tabular-nums">{formatDate(s.dueDate)}</TableCell>
                  <TableCell>
                    <Badge variant={INSTALLMENT_VARIANT[s.status]}>{INSTALLMENT_STATUS[s.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCOP(s.amount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCOP(s.paid)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pagos recibidos</CardTitle>
        </CardHeader>
        <CardContent>
          {own.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay pagos.</p>
          ) : (
            <ul className="grid gap-1.5 text-sm">
              {own.map((p) => (
                <li key={p.id} className={p.voidedAt ? "flex flex-wrap justify-between gap-2 opacity-60" : "flex flex-wrap justify-between gap-2"}>
                  <Link href={`/app/caja/recibos/${p.id}`} className="text-primary tabular-nums hover:underline">
                    Recibo {formatReceipt(p.receiptNumber)} · {formatDate(p.incomeDate)} · {PAYMENT_METHODS[p.method]}
                    {p.voidedAt && " · anulado"}
                  </Link>
                  <span className="tabular-nums">{formatCOP(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
