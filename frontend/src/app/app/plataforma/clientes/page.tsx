import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { NativeSelect } from "@/components/native-select";
import { Pager, pageParam } from "@/components/platform/pager";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { CYCLE_LABELS, STATUS_LABELS, STATUS_VARIANT, type ClinicRow, type PlanDto } from "@/lib/platform";
import type { Page } from "@/lib/types";

export const metadata: Metadata = { title: "Clientes · Plataforma" };

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v.slice(0, 120) : "");

export default async function ClientsPage({ searchParams }: PageProps<"/app/plataforma/clientes">) {
  const sp = await searchParams;
  const q = str(sp.q);
  const status = Object.hasOwn(STATUS_LABELS, str(sp.status)) ? str(sp.status) : "";
  const plan = str(sp.plan);
  const page = pageParam(sp.page);
  const qs = new URLSearchParams({ page: String(page), size: "25" });
  if (q) qs.set("q", q);
  if (status) qs.set("status", status);
  if (plan) qs.set("plan", plan);
  const [data, plans] = await Promise.all([
    api<Page<ClinicRow>>(`/api/platform/clinics?${qs}`),
    api<PlanDto[]>("/api/platform/plans"),
  ]);
  const hrefFor = (p1: number) => {
    const params = new URLSearchParams({ page: String(p1) });
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (plan) params.set("plan", plan);
    return `/app/plataforma/clientes?${params}`;
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <label htmlFor="q" className="text-sm font-medium">
              Buscar
            </label>
            <Input id="q" name="q" defaultValue={q} placeholder="Nombre, NIT, contacto o ciudad" className="w-64" />
          </div>
          <NativeSelect name="status" label="Estado" defaultValue={status} placeholder="Todos" options={STATUS_LABELS} />
          <NativeSelect
            name="plan"
            label="Plan"
            defaultValue={plan}
            placeholder="Todos"
            options={Object.fromEntries(plans.map((p) => [p.code, p.name]))}
          />
          <Button type="submit" variant="outline">
            Filtrar
          </Button>
        </form>
        <Link href="/app/plataforma/clientes/nuevo" className={buttonVariants()}>
          <Plus /> Nuevo cliente
        </Link>
      </div>

      <Card>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Uso</TableHead>
                <TableHead>Vence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.content.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/app/plataforma/clientes/${c.id}`} className="font-medium text-primary hover:underline">
                      {c.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {[c.city, c.contactName, c.contactEmail].filter(Boolean).join(" · ") || "Sin datos de contacto"}
                    </div>
                  </TableCell>
                  <TableCell>
                    {c.planName}
                    <div className="text-xs text-muted-foreground">
                      {CYCLE_LABELS[c.billingCycle]} · {c.modules.length} módulo{c.modules.length === 1 ? "" : "s"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[c.status]}>{STATUS_LABELS[c.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {c.usersActive}
                    {c.maxUsers ? ` / ${c.maxUsers}` : ""} usuarios
                    <div className="text-xs text-muted-foreground">{c.patients} pacientes</div>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {c.status === "TRIAL" && c.trialEndsAt
                      ? `Prueba: ${formatDate(c.trialEndsAt)}`
                      : c.currentPeriodEnd
                        ? formatDate(c.currentPeriodEnd)
                        : "Sin vencimiento"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {data.content.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Ningún cliente coincide con el filtro.</p>}
        </CardContent>
      </Card>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">{data.totalElements} cliente(s)</p>
        <Pager page={data.page} totalPages={data.totalPages} hrefFor={hrefFor} />
      </div>
    </div>
  );
}
