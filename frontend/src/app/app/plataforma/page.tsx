import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert, Info } from "lucide-react";
import { ActionForm } from "@/components/platform/action-form";
import { EventList } from "@/components/platform/event-list";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { formatCOP, formatDate } from "@/lib/format";
import type { ClinicAlert, Overview } from "@/lib/platform";
import { runEngine } from "./actions";

export const metadata: Metadata = { title: "Plataforma" };

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function AlertList({ title, empty, items, dateLabel }: { title: string; empty: string; items: ClinicAlert[]; dateLabel: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="grid gap-2 text-sm">
            {items.map((a) => (
              <li key={a.clinicId} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <Link href={`/app/plataforma/clientes/${a.clinicId}`} className="font-medium text-primary hover:underline">
                  {a.clinicName}
                </Link>
                <span className="text-muted-foreground tabular-nums">
                  {dateLabel} {formatDate(a.date)}
                  {a.amount != null && ` · ${formatCOP(a.amount)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default async function PlatformOverviewPage() {
  const o = await api<Overview>("/api/platform/overview");
  const c = o.clinics;
  return (
    <div className="grid gap-6">
      {o.gatewayMode === "simulated" && (
        <Alert>
          <Info />
          <AlertDescription>
            La pasarela de pagos está en <strong>modo simulado</strong>: no se cobra dinero real. Los cobros automáticos solo
            sirven para probar el ciclo; los pagos reales se registran a mano en cada cliente.
          </AlertDescription>
        </Alert>
      )}
      {!o.schedulerEnabled && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>
            El proceso automático de renovaciones y suspensiones está <strong>apagado</strong> en este entorno. Las fechas de acceso
            se respetan igual, pero no se envían avisos ni se cobra solo. Puedes ejecutarlo a mano aquí abajo.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Clientes" value={c.total} />
        <Kpi label="En prueba" value={c.trial} />
        <Kpi label="Activos" value={c.active} />
        <Kpi label="En mora" value={c.pastDue} />
        <Kpi label="Suspendidos" value={c.suspended} />
        <Kpi label="Cancelados" value={c.cancelled} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Kpi label="Ingreso mensual recurrente" value={formatCOP(o.mrr)} hint="Activos y en mora; el plan anual dividido en 12" />
        <Kpi label="Ingreso anual proyectado" value={formatCOP(o.arr)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <AlertList title="Pruebas por terminar" empty="Ninguna prueba termina pronto." items={o.trialsEnding} dateLabel="termina" />
        <AlertList title="Pagos pendientes" empty="Nadie está en mora." items={o.pastDue} dateLabel="desde" />
        <AlertList title="Renovaciones próximas" empty="Sin renovaciones en los próximos días." items={o.renewalsUpcoming} dateLabel="renueva" />
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Proceso de suscripciones</CardTitle>
          <CardDescription>
            Crea los cobros que vencen, intenta los automáticos, suspende a quien superó los {o.graceDays} días de gracia y envía los
            avisos. Es seguro ejecutarlo varias veces.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={runEngine} submit="Ejecutar ahora" pendingLabel="Ejecutando…" variant="outline" className="flex flex-wrap items-center gap-3">
            <span />
          </ActionForm>
        </CardContent>
      </Card>

      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">Actividad reciente</h2>
        <EventList events={o.recentEvents} empty="Aún no hay actividad." />
      </section>
    </div>
  );
}
