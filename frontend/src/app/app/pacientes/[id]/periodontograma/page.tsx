import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChartSpline, Pencil, Plus, ShieldAlert, ShieldCheck } from "lucide-react";
import { Timeline } from "@/components/app/timeline";
import { Periodontogram } from "@/components/periodontogram";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, getMe } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { perioStats } from "@/lib/periodontogram";
import { canReadClinical, canWriteClinical, type PerioExam } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Periodontograma" };

const mm = (n: number) => `${n.toLocaleString("es-CO", { maximumFractionDigits: 2 })} mm`;

/**
 * Periodontogramas del paciente: cada control es un examen propio (borrador o firmado). La línea de tiempo salta
 * entre fechas (?examen=<id>) y el comparativo muestra cómo evolucionan los indicadores.
 */
export default async function PeriodontogramPage({ params, searchParams }: PageProps<"/app/pacientes/[id]/periodontograma">) {
  const [{ id }, { examen }] = await Promise.all([params, searchParams]);
  const me = await getMe();
  if (!canReadClinical(me)) redirect(`/app/pacientes/${id}`);
  const canWrite = canWriteClinical(me);

  const exams = await api<PerioExam[]>(`/api/patients/${id}/periodontal-exams`);
  const selected = exams.find((e) => e.id === examen) ?? exams[0];
  const base = `/app/pacientes/${id}/periodontograma`;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Periodontograma</h2>
          <p className="text-sm text-muted-foreground">Un periodontograma por control. Al firmarlo queda inmutable.</p>
        </div>
        {canWrite && (
          <Link href={`${base}/nuevo`} className={buttonVariants()}>
            <Plus /> Nuevo periodontograma
          </Link>
        )}
      </div>

      {!selected ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <ChartSpline className="size-8 text-muted-foreground" />
            <p className="font-medium">El paciente aún no tiene periodontogramas</p>
            <p className="text-sm text-muted-foreground">
              Registra sondaje, margen gingival, sangrado, placa, furcas y movilidad en un nuevo periodontograma.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Línea de tiempo</CardTitle>
              <CardDescription>Elige una fecha para ver el periodontograma de ese control.</CardDescription>
            </CardHeader>
            <CardContent>
              <Timeline
                label="Fechas de los periodontogramas"
                items={exams.map((e) => ({
                  key: e.id,
                  href: `${base}?examen=${e.id}`,
                  label: formatDate(e.examinedAt),
                  detail: e.status === "SIGNED" ? e.dentist.name : "Borrador",
                  active: e.id === selected.id,
                  draft: e.status === "DRAFT",
                }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {formatDateTime(selected.examinedAt)}
                {selected.status === "SIGNED" ? <Badge variant="secondary">Firmado</Badge> : <Badge variant="outline">Borrador</Badge>}
              </CardTitle>
              <CardDescription>
                {selected.dentist.name}
                {selected.signedAt && ` · firmado el ${formatDateTime(selected.signedAt)}`}
              </CardDescription>
              {canWrite && selected.status === "DRAFT" && selected.dentist.id === me.id && (
                <CardAction>
                  <Link href={`${base}/${selected.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    <Pencil /> Continuar
                  </Link>
                </CardAction>
              )}
            </CardHeader>
            <CardContent className="grid gap-4">
              {selected.observations && (
                <p className="text-sm whitespace-pre-line">
                  <span className="text-muted-foreground">Observaciones: </span>
                  {selected.observations}
                </p>
              )}
              <Periodontogram teeth={selected.chart.teeth} />
              {selected.status === "SIGNED" &&
                (selected.integrityOk ? (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground" title={`SHA-256 ${selected.contentHash}`}>
                    <ShieldCheck className="size-3.5" /> Contenido íntegro desde la firma
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5 text-xs text-destructive">
                    <ShieldAlert className="size-3.5" /> El contenido no coincide con el registrado al firmar
                  </p>
                ))}
            </CardContent>
          </Card>

          {exams.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Comparativo de controles</CardTitle>
                <CardDescription>Cómo evolucionan los indicadores entre periodontogramas.</CardDescription>
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
                    {exams.map((e) => {
                      const s = perioStats(e.chart);
                      const active = e.id === selected.id;
                      return (
                        <TableRow key={e.id} className={cn(active && "bg-muted/60")}>
                          <TableCell>
                            <Link href={`${base}?examen=${e.id}`} className={cn("text-primary hover:underline", active && "font-medium")}>
                              {formatDateTime(e.examinedAt)}
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
          )}
        </>
      )}
    </div>
  );
}
