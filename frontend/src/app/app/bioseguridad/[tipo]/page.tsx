import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PaginationLinks } from "@/components/pagination-links";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, getMe } from "@/lib/api";
import { todayCO } from "@/lib/agenda-time";
import { BIOSAFETY_KINDS, displayValue, kindBySlug, type BiosafetyField, type BiosafetyRecord } from "@/lib/biosafety";
import { formatDate } from "@/lib/format";
import type { Page, Site } from "@/lib/types";
import { RecordForm } from "../record-form";
import { VoidRecord } from "../void-record";

export const metadata: Metadata = { title: "Bioseguridad" };

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function BiosafetyKindPage({ params, searchParams }: PageProps<"/app/bioseguridad/[tipo]">) {
  const [{ tipo }, sp] = await Promise.all([params, searchParams]);
  const kind = kindBySlug(tipo);
  if (!kind) notFound();
  const info = BIOSAFETY_KINDS[kind];
  const fields: readonly BiosafetyField[] = info.fields;
  const me = await getMe();
  const today = todayCO();
  const back = new Date(`${today}T00:00:00Z`);
  back.setUTCDate(back.getUTCDate() - 30);
  const defaultFrom = back.toISOString().slice(0, 10);
  const from = isDate(sp.desde) ? sp.desde : defaultFrom;
  const to = isDate(sp.hasta) ? sp.hasta : today;
  const page = Math.max(0, Math.trunc(Number(sp.page) || 0));
  const [list, sites] = await Promise.all([
    api<Page<BiosafetyRecord>>(`/api/biosafety?kind=${kind}&from=${from}&to=${to}&page=${page}&size=25`),
    api<Site[]>("/api/sites"),
  ]);
  const columns = fields.filter((f) => !f.wide).slice(0, 5);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Nuevo registro · {info.label}</CardTitle>
          <CardDescription>{info.description} Queda a nombre de {me.fullName}.</CardDescription>
        </CardHeader>
        <CardContent>
          <RecordForm kind={kind} sites={sites.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }))} today={today} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registros</CardTitle>
          <CardDescription>
            {list.totalElements} del {formatDate(from)} al {formatDate(to)}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="desde">Desde</Label>
              <Input id="desde" name="desde" type="date" defaultValue={from} max={today} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="hasta">Hasta</Label>
              <Input id="hasta" name="hasta" type="date" defaultValue={to} max={today} />
            </div>
            <Button type="submit" variant="outline">
              Filtrar
            </Button>
          </form>
          {list.content.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin registros en esas fechas.</p>
          ) : (
            <Table pagination={false}>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Sede</TableHead>
                  {columns.map((c) => (
                    <TableHead key={c.name}>{c.label}</TableHead>
                  ))}
                  <TableHead>Responsable</TableHead>
                  {me.role === "ADMIN" && <TableHead className="w-0" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.content.map((r) => (
                  <TableRow key={r.id} className={r.voidedAt ? "opacity-60" : undefined}>
                    <TableCell className="tabular-nums">
                      {formatDate(r.recordDate)}
                      {r.alert && <Badge variant="destructive" className="ml-1">{r.alert}</Badge>}
                      {r.voidedAt && <Badge variant="outline" className="ml-1">Anulado</Badge>}
                    </TableCell>
                    <TableCell>{r.site.name}</TableCell>
                    {columns.map((c) => (
                      <TableCell key={c.name} className="whitespace-normal">
                        {displayValue(c, r.data[c.name])}
                      </TableCell>
                    ))}
                    <TableCell className="whitespace-normal">
                      {r.responsible?.name ?? "—"}
                      {(r.notes || fields.some((f) => f.wide && r.data[f.name])) && (
                        <span className="block text-xs text-muted-foreground">
                          {[...fields.filter((f) => f.wide).map((f) => r.data[f.name] && `${f.label}: ${r.data[f.name]}`), r.notes]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                    </TableCell>
                    {me.role === "ADMIN" && <TableCell>{!r.voidedAt && <VoidRecord id={r.id} />}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <PaginationLinks
            page={list.page}
            pages={list.totalPages}
            total={list.totalElements}
            href={(p) => `/app/bioseguridad/${tipo}?desde=${from}&hasta=${to}&page=${p}`}
          />
        </CardContent>
      </Card>
    </div>
  );
}
