import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, getMe } from "@/lib/api";
import { todayCO } from "@/lib/agenda-time";
import { formatCOP, formatDate, formatDateTime } from "@/lib/format";
import { reportByKey, type TableReport } from "@/lib/reports-catalog";
import type { Site } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Informe" };

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

function cell(type: TableReport["columns"][number]["type"], v: string | number | null | undefined) {
  if (v === null || v === undefined || v === "") return "—";
  switch (type) {
    case "MONEY":
      return formatCOP(Number(v));
    case "NUMBER":
      return Number(v).toLocaleString("es-CO", { maximumFractionDigits: 3 });
    case "DATE":
      return formatDate(String(v));
    case "DATETIME":
      return formatDateTime(String(v));
    default:
      return String(v);
  }
}

export default async function ReportPage({ params, searchParams }: PageProps<"/app/informes/[key]">) {
  const [{ key }, sp] = await Promise.all([params, searchParams]);
  const entry = reportByKey(key);
  if (!entry || entry.soon) notFound();
  const me = await getMe();
  if (me.role !== "ADMIN") redirect("/app");
  const today = todayCO();
  const from = isDate(sp.desde) ? sp.desde : `${today.slice(0, 8)}01`;
  const to = isDate(sp.hasta) ? sp.hasta : today;
  const siteId = typeof sp.sede === "string" && /^[0-9a-f-]{36}$/.test(sp.sede) ? sp.sede : "";
  const query = new URLSearchParams({ from, to });
  if (siteId && entry.site) query.set("siteId", siteId);
  const [report, sites] = await Promise.all([
    api<TableReport>(`/api/reports/tables/${key}?${query}`),
    entry.site ? api<Site[]>("/api/sites") : Promise.resolve([] as Site[]),
  ]);
  const numeric = (t: string) => t === "MONEY" || t === "NUMBER";
  const hasTotals = Object.keys(report.totals).length > 0;

  return (
    <div className="mx-auto grid max-w-7xl gap-6">
      <div>
        <Link href="/app/informes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Centro de informes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{report.title}</h1>
        <p className="text-muted-foreground">{report.description}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{report.rows.length} {report.rows.length === 1 ? "fila" : "filas"}</CardTitle>
          <CardDescription>
            {entry.dates ? `Del ${formatDate(from)} al ${formatDate(to)}` : "Estado a hoy"}
            {report.truncated && " · se muestran las primeras 5.000 filas"}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            {(entry.dates || entry.site) && (
              <form className="flex flex-wrap items-end gap-3">
                {entry.dates && (
                  <>
                    <div className="grid gap-1.5">
                      <Label htmlFor="desde">Desde</Label>
                      <Input id="desde" name="desde" type="date" defaultValue={from} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="hasta">Hasta</Label>
                      <Input id="hasta" name="hasta" type="date" defaultValue={to} />
                    </div>
                  </>
                )}
                {entry.site && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="sede">Sede</Label>
                    <select id="sede" name="sede" defaultValue={siteId} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30">
                      <option value="">Todas</option>
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <Button type="submit" variant="outline">
                  Consultar
                </Button>
              </form>
            )}
            <a href={`/bff/reports/tables/${key}?${query}`} className={buttonVariants({ variant: "outline" })}>
              <Download /> Exportar CSV
            </a>
          </div>

          {report.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin datos para estos filtros.</p>
          ) : (
            <Table pagination={report.rows.length > 50} pageSize={50}>
              <TableHeader>
                <TableRow>
                  {report.columns.map((c) => (
                    <TableHead key={c.key} className={cn(numeric(c.type) && "text-right")}>
                      {c.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((r, i) => (
                  <TableRow key={i}>
                    {report.columns.map((c) => (
                      <TableCell key={c.key} className={cn("whitespace-normal", numeric(c.type) && "text-right tabular-nums")}>
                        {cell(c.type, r[c.key])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
              {hasTotals && (
                <TableFooter>
                  <TableRow>
                    {report.columns.map((c, i) => (
                      <TableCell key={c.key} className={cn("font-semibold", numeric(c.type) && "text-right tabular-nums")}>
                        {c.key in report.totals ? cell(c.type, report.totals[c.key]) : i === 0 ? (key === "cop" ? "Promedio" : "Total") : ""}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
