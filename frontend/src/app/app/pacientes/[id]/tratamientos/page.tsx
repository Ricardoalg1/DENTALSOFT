import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, getMe } from "@/lib/api";
import { formatCOP, formatDate, formatDateTime, formatReceipt } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  PAYMENT_METHODS,
  canCollect,
  type Account,
  type CashSession,
  type Payment,
  type PlanSummary,
} from "@/lib/types";
import { NewPlanForm } from "./new-plan-form";
import { PaymentForm } from "./payment-form";
import { PlanStatusBadge } from "./plan-status-badge";

export const metadata: Metadata = { title: "Tratamientos y pagos" };

export default async function TreatmentsPage({ params }: PageProps<"/app/pacientes/[id]/tratamientos">) {
  const { id } = await params;
  const me = await getMe();
  const collect = canCollect(me);
  const [plans, account, payments, sessions] = await Promise.all([
    api<PlanSummary[]>(`/api/patients/${id}/treatment-plans`),
    collect ? api<Account>(`/api/patients/${id}/account`) : null,
    collect ? api<Payment[]>(`/api/patients/${id}/payments`) : [],
    collect ? api<CashSession[]>("/api/cash-sessions") : [],
  ]);
  const openSites = sessions.filter((s) => !s.closedAt).map((s) => s.site);
  const payablePlans = plans
    .filter((p) => p.status === "ACCEPTED" || p.status === "COMPLETED")
    .map((p) => ({ id: p.id, name: p.title }));

  return (
    <div className="grid gap-6">
      {account && <AccountSummary account={account} />}

      <Card>
        <CardHeader>
          <CardTitle>Planes de tratamiento</CardTitle>
          <CardDescription>Presupuestos del paciente. Al aceptarlos, los precios quedan fijos.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {me.professional && <NewPlanForm patientId={id} />}
          {plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">El paciente aún no tiene planes de tratamiento.</p>
          ) : (
            <ul className="grid divide-y">
              {plans.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <Link href={`/app/pacientes/${id}/tratamientos/${p.id}`} className="font-medium text-primary hover:underline">
                      {p.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(p.createdAt.slice(0, 10))} · {p.dentist?.name} · {p.itemCount}{" "}
                      {p.itemCount === 1 ? "procedimiento" : "procedimientos"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="tabular-nums">
                      {formatCOP(p.totals.total)}
                      {p.totals.done > 0 && (
                        <span className="text-muted-foreground"> · realizado {formatCOP(p.totals.done)}</span>
                      )}
                    </span>
                    <PlanStatusBadge status={p.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {collect && account && (
        <Card>
          <CardHeader>
            <CardTitle>Pagos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <PaymentForm
              patientId={id}
              openSites={openSites}
              plans={payablePlans}
              suggestedAmount={Math.max(account.balance, 0)}
            />
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin pagos registrados.</p>
            ) : (
              <ul className="grid divide-y text-sm">
                {payments.map((p) => (
                  <li key={p.id} className={cn("flex flex-wrap items-center justify-between gap-2 py-2", p.voidedAt && "opacity-60")}>
                    <div>
                      <Link href={`/app/caja/recibos/${p.id}`} className="font-medium text-primary hover:underline">
                        Recibo N.º {formatReceipt(p.receiptNumber)}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(p.receivedAt)} · {PAYMENT_METHODS[p.method]}
                        {p.plan && ` · ${p.plan.name}`}
                        {p.voidedAt && ` · ANULADO: ${p.voidReason}`}
                      </p>
                    </div>
                    <span className={cn("tabular-nums", p.voidedAt && "line-through")}>{formatCOP(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AccountSummary({ account }: { account: Account }) {
  const balanceLabel = account.balance > 0 ? "Saldo pendiente" : account.balance < 0 ? "Saldo a favor" : "Al día";
  const cards = [
    { label: "Presupuestado (aceptado)", value: account.budgeted },
    { label: "Realizado", value: account.done },
    { label: "Pagado", value: account.paid },
  ];
  return (
    <section aria-label="Estado de cuenta" className="grid gap-3 sm:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">{c.label}</p>
          <p className="text-lg font-semibold tabular-nums">{formatCOP(c.value)}</p>
        </div>
      ))}
      <div
        className={cn(
          "rounded-xl border p-4",
          account.balance > 0 && "border-destructive/40 bg-destructive/5",
          account.balance < 0 && "border-primary/40 bg-primary/5",
        )}
      >
        <p className="text-xs text-muted-foreground">{balanceLabel}</p>
        <p className="text-lg font-semibold tabular-nums">{formatCOP(Math.abs(account.balance))}</p>
      </div>
    </section>
  );
}
