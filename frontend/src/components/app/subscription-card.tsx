import { Crown } from "lucide-react";
import { PayButtons } from "@/components/app/pay-buttons";
import { CardForm } from "@/components/app/card-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCOP, formatDate } from "@/lib/format";
import { CHARGE_STATUS_LABELS, CYCLE_LABELS, MODULE_LABELS, STATUS_LABELS, STATUS_VARIANT, type SubscriptionState } from "@/lib/platform";
import type { ModuleKey } from "@/lib/types";

/** Suscripción y pagos, para el administrador de la clínica. */
export function SubscriptionCard({ state, modules }: { state: SubscriptionState; modules: ModuleKey[] }) {
  const s = state;
  return (
    <Card className="reference-subscription">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span className="reference-icon reference-icon-blue"><Crown aria-hidden="true" /></span>Plan {s.planName}
          <Badge variant={STATUS_VARIANT[s.status]}>{STATUS_LABELS[s.status]}</Badge>
        </CardTitle>
        <CardDescription>
          {s.planCode === "INTERNAL"
            ? "Cuenta sin cobro."
            : `${formatCOP(s.price)} ${s.billingCycle === "MONTHLY" ? "al mes" : "al año"} · ciclo ${CYCLE_LABELS[s.billingCycle].toLowerCase()}`}
          {s.dueDate && s.planCode !== "INTERNAL" && ` · próximo pago: ${formatDate(s.dueDate)}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-1.5 text-sm">
          <p className="font-medium">Módulos incluidos</p>
          <ul className="flex flex-wrap gap-2">
            {modules.length ? (
              modules.map((m) => (
                <li key={m}>
                  <Badge variant="outline">{MODULE_LABELS[m]}</Badge>
                </li>
              ))
            ) : (
              <li className="text-muted-foreground">Solo las funciones básicas (pacientes y agenda).</li>
            )}
          </ul>
          <p className="text-xs text-muted-foreground">Para cambiar de plan o agregar módulos, escribe al equipo de Occlus.</p>
        </div>
        {s.canPay ? (
          <div className="grid gap-2">
            <p className="text-sm font-medium">Pagar ahora</p>
            <PayButtons providers={s.checkoutProviders} />
            <p className="text-xs text-muted-foreground">Pagas en la página segura de la pasarela. Cuando se apruebe, tu suscripción se actualiza sola.</p>
          </div>
        ) : (
          s.cannotPayReason && <p className="text-sm text-muted-foreground">{s.cannotPayReason}</p>
        )}

        {s.cardOnFileAvailable && s.canPay && <CardForm current={s.paymentMethod} />}

        {s.charges.length > 0 && (
          <div className="grid gap-2">
            <p className="text-sm font-medium">Historial</p>
            <ul className="divide-y rounded-lg border text-sm">
              {s.charges.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5">
                  <span className="tabular-nums">
                    {formatDate(c.periodStart)} – {formatDate(c.periodEnd)}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums">{formatCOP(c.amount)}</span>
                    <Badge variant={c.status === "PAID" ? "default" : c.status === "FAILED" ? "destructive" : "outline"}>
                      {CHARGE_STATUS_LABELS[c.status] ?? c.status}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
