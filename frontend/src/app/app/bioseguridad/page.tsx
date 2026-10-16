import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { BIOSAFETY_KINDS, type BiosafetySummary } from "@/lib/biosafety";
import { formatDate } from "@/lib/format";
import { KIND_ICONS } from "./biosafety-icons";


export const metadata: Metadata = { title: "Bioseguridad" };

export default async function BiosafetyPage() {
  const summary = await api<BiosafetySummary>("/api/biosafety/summary");
  return (
    <div className="grid gap-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {summary.counts.map((c) => {
          const info = BIOSAFETY_KINDS[c.kind];
          const Icon = KIND_ICONS[c.kind];
          return (
            <Link key={c.kind} href={`/app/bioseguridad/${info.slug}`} className="rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40">
              <div className="flex items-center gap-2 font-medium">
                <Icon className="size-4 text-primary" /> {info.label}
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{c.last30Days}</p>
              <p className="text-xs text-muted-foreground">
                registros en 30 días · último {c.lastRecord ? formatDate(c.lastRecord) : "nunca"}
              </p>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircleAlert className="size-4 text-destructive" /> Hallazgos recientes
            </CardTitle>
            <CardDescription>Últimos 90 días: indicadores no conformes, nevera fuera de rango, accidentes sin reportar.</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin hallazgos.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {summary.alerts.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
                    <span>
                      <strong>{a.alert}</strong> · {BIOSAFETY_KINDS[a.kind].label}
                    </span>
                    <span className="text-muted-foreground">
                      {a.site.name} · {formatDate(a.recordDate)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="size-4" /> Mantenimientos por vencer
            </CardTitle>
            <CardDescription>Vencidos o en los próximos 30 días (último registro de cada equipo).</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.maintenanceDue.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada por vencer.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {summary.maintenanceDue.map((m) => (
                  <li key={`${m.site.id}-${m.equipment}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                    <span>
                      {m.equipment} · <span className="text-muted-foreground">{m.site.name}</span>
                    </span>
                    <Badge variant={m.overdue ? "destructive" : "secondary"}>
                      {m.overdue ? "Vencido" : "Vence"} {formatDate(m.nextDue)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
