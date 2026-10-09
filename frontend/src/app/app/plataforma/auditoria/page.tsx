import type { Metadata } from "next";
import Link from "next/link";
import { NativeSelect } from "@/components/native-select";
import { Pager, pageParam } from "@/components/platform/pager";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { AUDIT_ACTION_LABELS, type AuditRow } from "@/lib/platform";
import type { Page } from "@/lib/types";

export const metadata: Metadata = { title: "Auditoría · Plataforma" };

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v.slice(0, 120) : "");

export default async function AuditPage({ searchParams }: PageProps<"/app/plataforma/auditoria">) {
  const sp = await searchParams;
  const clinicId = /^[0-9a-f-]{36}$/i.test(str(sp.clinicId)) ? str(sp.clinicId) : "";
  const action = str(sp.action);
  const q = str(sp.q);
  const page = pageParam(sp.page);
  const qs = new URLSearchParams({ page: String(page), size: "30" });
  if (clinicId) qs.set("clinicId", clinicId);
  if (action) qs.set("action", action);
  if (q) qs.set("q", q);
  const [data, actions] = await Promise.all([api<Page<AuditRow>>(`/api/platform/audit?${qs}`), api<string[]>("/api/platform/audit/actions")]);
  const hrefFor = (p1: number) => {
    const params = new URLSearchParams({ page: String(p1) });
    if (clinicId) params.set("clinicId", clinicId);
    if (action) params.set("action", action);
    if (q) params.set("q", q);
    return `/app/plataforma/auditoria?${params}`;
  };

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Todo lo que hace el equipo de Occlus sobre los clientes. Los registros no se pueden editar ni borrar, ni siquiera desde la aplicación.
      </p>
      <form className="flex flex-wrap items-end gap-3">
        {clinicId && <input type="hidden" name="clinicId" value={clinicId} />}
        <NativeSelect
          name="action"
          label="Acción"
          defaultValue={action}
          placeholder="Todas"
          options={Object.fromEntries(actions.map((a) => [a, AUDIT_ACTION_LABELS[a] ?? a]))}
        />
        <div className="grid gap-1.5">
          <label htmlFor="q" className="text-sm font-medium">
            Buscar en el resumen
          </label>
          <Input id="q" name="q" defaultValue={q} className="w-64" />
        </div>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
        {clinicId && (
          <Link href="/app/plataforma/auditoria" className="pb-1.5 text-sm text-primary hover:underline">
            Quitar filtro de cliente
          </Link>
        )}
      </form>

      <Card>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Quién</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.content.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="align-top text-sm whitespace-nowrap tabular-nums">{formatDateTime(a.at)}</TableCell>
                  <TableCell className="align-top text-sm">{a.actorName ?? "Sistema"}</TableCell>
                  <TableCell className="align-top text-sm font-medium">{AUDIT_ACTION_LABELS[a.action] ?? a.action}</TableCell>
                  <TableCell className="text-sm whitespace-normal">
                    {a.clinicId && a.clinicName && (
                      <Link href={`/app/plataforma/clientes/${a.clinicId}`} className="font-medium text-primary hover:underline">
                        {a.clinicName}
                      </Link>
                    )}
                    <p>{a.summary}</p>
                    {a.details && Object.keys(a.details).length > 0 && (
                      <details className="mt-1 text-xs text-muted-foreground">
                        <summary className="cursor-pointer">Ver detalle</summary>
                        <pre className="mt-1 max-w-full overflow-x-auto rounded bg-muted p-2 whitespace-pre-wrap">{JSON.stringify(a.details, null, 2)}</pre>
                        {a.requestId && <p className="mt-1">Solicitud: {a.requestId}</p>}
                      </details>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {data.content.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No hay registros para este filtro.</p>}
        </CardContent>
      </Card>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">{data.totalElements} registro(s)</p>
        <Pager page={data.page} totalPages={data.totalPages} hrefFor={hrefFor} />
      </div>
    </div>
  );
}
