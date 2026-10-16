import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChartSpline, Pencil, Plus } from "lucide-react";
import { Periodontogram } from "@/components/periodontogram";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, getMe } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { perioStats } from "@/lib/periodontogram";
import { canReadClinical, canWriteClinical, type PerioChartEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Periodontograma" };

const mm = (n: number) => `${n.toLocaleString("es-CO", { maximumFractionDigits: 2 })} mm`;

/**
 * Historial de periodontogramas del paciente. Cada uno se registra dentro de una evolución (y queda inmutable al
 * firmarla); aquí se comparan sus indicadores y se ve el elegido con ?nota=<id de la evolución>.
 */
export default async function PeriodontogramPage({ params, searchParams }: PageProps<"/app/pacientes/[id]/periodontograma">) {
  const [{ id }, { nota }] = await Promise.all([params, searchParams]);
  const me = await getMe();
  if (!canReadClinical(me)) redirect(`/app/pacientes/${id}`);
  const canWrite = canWriteClinical(me);

  const entries = await api<PerioChartEntry[]>(`/api/patients/${id}/periodontal-charts`);
  const selected = entries.find((e) => e.noteId === nota) ?? entries[0];
  const base = `/app/pacientes/${id}/periodontograma`;
  const newHref = `/app/pacientes/${id}/historia/nueva?periodontograma=1#periodontograma`;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Periodontograma</h2>
          <p className="text-sm text-muted-foreground">
            Cada periodontograma se registra dentro de una evolución y queda inmutable al firmarla.
          </p>
        </div>
        {canWrite && (
          <Link href={newHref} className={buttonVariants()}>
            <Plus /> Nuevo periodontograma
          </Link>
        )}
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <ChartSpline className="size-8 text-muted-foreground" />
            <p className="font-medium">El paciente aún no tiene periodontogramas</p>
            <p className="text-sm text-muted-foreground">
              Registra sondaje, margen gingival, sangrado, placa, furcas y movilidad en una nueva evolución.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Historial</CardTitle>
              <CardDescription>Compara la evolución de los indicadores entre controles.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Profesional</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Sondaje medio</TableHead>
                    <TableHead className="text-right">Inserción media</TableHead>
                    <TableHead className="text-right">Placa</TableHead>
                    <TableHead className="text-right">Sangrado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => {
                    const s = perioStats(e.chart);
                    const active = e.noteId === selected.noteId;
                    return (
                      <TableRow key={e.noteId} className={cn(active && "bg-muted/60")}>
                        <TableCell>
                          <Link
                            href={`${base}?nota=${e.noteId}`}
                            aria-current={active ? "true" : undefined}
                            className={cn("text-primary hover:underline", active && "font-medium")}
                          >
                            {formatDateTime(e.attendedAt)}
                          </Link>
                        </TableCell>
                        <TableCell>{e.dentist.name}</TableCell>
                        <TableCell>
                          {e.status === "SIGNED" ? <Badge variant="secondary">Firmado</Badge> : <Badge variant="outline">Borrador</Badge>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{mm(s.meanPd)}</TableCell>
                        <TableCell className="text-right tabular-nums">{mm(s.meanCal)}</TableCell>
                        <TableCell className="text-right tabular-nums">{Math.round(s.plaquePct)}%</TableCell>
                        <TableCell className="text-right tabular-nums">{Math.round(s.bopPct)}%</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {formatDateTime(selected.attendedAt)}
                {selected.status === "SIGNED" ? <Badge variant="secondary">Firmado</Badge> : <Badge variant="outline">Borrador</Badge>}
              </CardTitle>
              <CardDescription>{selected.dentist.name}</CardDescription>
              {canWrite && selected.status === "DRAFT" && selected.dentist.id === me.id && (
                <CardAction>
                  <Link
                    href={`/app/pacientes/${id}/historia/${selected.noteId}`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    <Pencil /> Continuar
                  </Link>
                </CardAction>
              )}
            </CardHeader>
            <CardContent>
              <Periodontogram teeth={selected.chart.teeth} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
