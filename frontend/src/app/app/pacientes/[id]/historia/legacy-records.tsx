import { History, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/format";
import type { LegacyRecord } from "@/lib/migration";

/**
 * Historia traída del programa anterior (migración). Solo lectura: no son evoluciones firmadas en Occlus,
 * por eso se muestran aparte y con el profesional tal como venía en el archivo.
 */
export function LegacyRecords({ records }: { records: LegacyRecord[] }) {
  if (records.length === 0) return null;
  const sources = [...new Set(records.map((r) => r.sourceSystem))].join(", ");
  return (
    <section className="grid gap-4">
      <details className="group" open={records.length <= 5}>
        <summary className="flex cursor-pointer list-none items-center gap-2 text-lg font-semibold">
          <History className="size-5 text-muted-foreground" />
          Historia del programa anterior
          <Badge variant="outline">{records.length}</Badge>
          <span className="text-sm font-normal text-muted-foreground group-open:hidden">· mostrar</span>
        </summary>
        <p className="mt-1 text-sm text-muted-foreground">
          Importada desde {sources}. Es de solo lectura y conserva los datos tal como venían; para correcciones agrega
          una evolución nueva.
        </p>
        <div className="mt-4 grid gap-3">
          {records.map((r) => (
            <Card key={r.id} className="rounded-sm border-dashed">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {r.dateOnly ? formatDate(r.attendedAt) : formatDateTime(r.attendedAt)}
                  {r.recordType && <Badge variant="secondary">{r.recordType}</Badge>}
                  <Badge variant="outline">{r.sourceSystem}</Badge>
                </CardTitle>
                <CardDescription>{r.professionalName ?? "Profesional no indicado"}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(0,12rem)_1fr]">
                  <Row label="Motivo de consulta">{r.reason}</Row>
                  <Row label="Diagnóstico">
                    {(r.diagnosisCode || r.diagnosisDescription) && (
                      <>
                        {r.diagnosisCode && <span className="font-medium tabular-nums">{r.diagnosisCode}</span>} {r.diagnosisDescription}
                      </>
                    )}
                  </Row>
                  <Row label="Evolución / descripción">{r.description}</Row>
                  <Row label="Procedimientos">{r.procedures}</Row>
                  <Row label="Plan / indicaciones">{r.plan}</Row>
                </dl>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {r.integrityOk ? (
                    <ShieldCheck className="size-3.5" />
                  ) : (
                    <ShieldAlert className="size-3.5 text-destructive" />
                  )}
                  {r.integrityOk ? "Sin cambios desde la importación" : "El contenido no coincide con el importado"} · importado por{" "}
                  {r.importedBy?.name ?? "—"} el {formatDateTime(r.importedAt)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </details>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === "" || children === false) return null;
  return (
    <div className="contents">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 whitespace-pre-line break-words">{children}</dd>
    </div>
  );
}
