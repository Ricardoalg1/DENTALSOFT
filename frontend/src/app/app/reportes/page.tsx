import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { FormError } from "@/components/form-error";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { todayCO } from "@/lib/agenda-time";
import { api, ApiError, getMe } from "@/lib/api";
import { formatCOP, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  APPOINTMENT_STATUS,
  PAYMENT_METHODS,
  PROCEDURE_CATEGORIES,
  type AppointmentStatus,
  type Receivables,
  type Report,
  type Site,
} from "@/lib/types";
import { BarList } from "./bar-list";
import { formatPercent } from "./chart-format";
import { RevenueChart } from "./revenue-chart";

export const metadata: Metadata = { title: "Reportes" };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Periodos rápidos, calculados con la fecha de Colombia. */
function presets(today: string) {
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const monthStart = `${y}-${pad(m)}-01`;
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const prevEnd = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
  const minus29 = new Date(Date.parse(`${today}T00:00:00Z`) - 29 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return [
    { label: "Este mes", from: monthStart, to: today },
    { label: "Mes anterior", from: `${prevY}-${pad(prevM)}-01`, to: prevEnd },
    { label: "Últimos 30 días", from: minus29, to: today },
    { label: "Este año", from: `${y}-01-01`, to: today },
  ];
}

export default async function ReportsPage({
  searchParams,
}: PageProps<"/app/reportes">) {
  const me = await getMe();
  if (me.role !== "ADMIN") redirect("/app");

  const sp = await searchParams;
  const today = todayCO();
  const quick = presets(today);
  const from =
    typeof sp.from === "string" && ISO_DATE.test(sp.from)
      ? sp.from
      : quick[0].from;
  const to =
    typeof sp.to === "string" && ISO_DATE.test(sp.to) ? sp.to : quick[0].to;
  const siteId =
    typeof sp.siteId === "string" && sp.siteId ? sp.siteId : undefined;

  const query = new URLSearchParams({ from, to });
  if (siteId) query.set("siteId", siteId);

  const [sites, receivables] = await Promise.all([
    api<Site[]>("/api/sites"),
    api<Receivables>("/api/reports/receivables"),
  ]);
  let report: Report | null = null;
  let error: string | undefined;
  try {
    report = await api<Report>(`/api/reports?${query}`);
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    error = e.message;
  }

  const href = (f: string, t: string) => {
    const q = new URLSearchParams({ from: f, to: t });
    if (siteId) q.set("siteId", siteId);
    return `/app/reportes?${q}`;
  };

  return (
    <div className="grid max-w-6xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
        <p className="text-muted-foreground">
          {formatDate(from)} – {formatDate(to)}
          {report?.site && ` · ${report.site.name}`}
        </p>
      </div>

      {/* Filtros: una sola fila, arriba de todo lo que afectan. */}
      <div className="grid gap-3">
        <nav aria-label="Periodos rápidos" className="flex flex-wrap gap-2">
          {quick.map((p) => {
            const selected = p.from === from && p.to === to;
            return (
              <Link
                key={p.label}
                href={href(p.from, p.to)}
                aria-current={selected ? "true" : undefined}
                className={buttonVariants({
                  variant: selected ? "default" : "outline",
                  size: "sm",
                })}
              >
                {p.label}
              </Link>
            );
          })}
        </nav>
        <form className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="from">Desde</Label>
            <Input
              id="from"
              name="from"
              type="date"
              defaultValue={from}
              max={today}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="to">Hasta</Label>
            <Input
              id="to"
              name="to"
              type="date"
              defaultValue={to}
              max={today}
            />
          </div>
          {sites.length > 1 && (
            <div className="grid gap-1.5">
              <Label htmlFor="siteId">Sede</Label>
              <select
                id="siteId"
                name="siteId"
                defaultValue={siteId ?? ""}
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm dark:bg-input/30"
              >
                <option value="">Todas</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            type="submit"
            className={buttonVariants({ variant: "outline" })}
          >
            Aplicar
          </button>
          <a
            href={`/bff/reports/payments.csv?from=${from}&to=${to}`}
            className={cn(buttonVariants({ variant: "ghost" }), "ml-auto")}
          >
            <Download /> Exportar pagos (CSV)
          </a>
        </form>
      </div>

      <FormError message={error} />

      {report && (
        <>
          {/* Cifras principales */}
          <section
            aria-label="Resumen"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <StatTile
              label="Recaudado"
              value={formatCOP(report.revenue.total)}
              detail={`${report.revenue.count} pagos${
                report.revenue.voidedCount > 0
                  ? ` · ${report.revenue.voidedCount} anulados (${formatCOP(report.revenue.voidedTotal)})`
                  : ""
              }`}
            />
            <StatTile
              label="Producción"
              value={formatCOP(report.production.total)}
              detail={`${report.production.items} procedimientos realizados`}
            />
            <StatTile
              label="Asistencia a citas"
              value={formatPercent(report.appointments.attendanceRate)}
              detail={`${report.appointments.byStatus.NO_SHOW} inasistencias de ${
                report.appointments.byStatus.ATTENDED +
                report.appointments.byStatus.NO_SHOW
              } citas resueltas`}
            />
            <StatTile
              label="Pacientes nuevos"
              value={String(report.patients.newPatients)}
              detail={`${report.patients.attended} pacientes atendidos`}
            />
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Recaudo</CardTitle>
              <CardDescription>
                Pagos vigentes por{" "}
                {report.revenue.byDay.length > 62 ? "semana" : "día"}. Los
                anulados no se suman.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RevenueChart days={report.revenue.byDay} />
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Recaudo por medio de pago</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-6">
                <BarList
                  empty="Sin pagos en el periodo."
                  rows={report.revenue.byMethod.map((m) => ({
                    key: m.method,
                    label: PAYMENT_METHODS[m.method],
                    detail: `${m.count} ${m.count === 1 ? "pago" : "pagos"}`,
                    value: m.total,
                    display: formatCOP(m.total),
                  }))}
                />
                {!report.site && report.revenue.bySite.length > 1 && (
                  <div className="grid gap-3">
                    <h3 className="text-sm font-medium text-muted-foreground">
                      Por sede
                    </h3>
                    <BarList
                      empty=""
                      rows={report.revenue.bySite.map((s) => ({
                        key: s.site.id,
                        label: s.site.name,
                        value: s.total,
                        display: formatCOP(s.total),
                      }))}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Producción por profesional</CardTitle>
                <CardDescription>
                  Valor de los procedimientos marcados como realizados (todas
                  las sedes).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BarList
                  empty="Sin procedimientos realizados en el periodo."
                  rows={report.production.byProfessional.map((p) => ({
                    key: p.professional.id,
                    label: p.professional.name,
                    detail: `${p.items} proc.`,
                    value: p.total,
                    display: formatCOP(p.total),
                  }))}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Producción por especialidad</CardTitle>
              </CardHeader>
              <CardContent>
                <BarList
                  empty="Sin procedimientos realizados en el periodo."
                  rows={report.production.byCategory.map((c) => ({
                    key: c.category,
                    label: PROCEDURE_CATEGORIES[c.category],
                    detail: `${c.items} proc.`,
                    value: c.total,
                    display: formatCOP(c.total),
                  }))}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Procedimientos más realizados</CardTitle>
              </CardHeader>
              <CardContent>
                <BarList
                  empty="Sin procedimientos realizados en el periodo."
                  rows={report.production.topProcedures.map((p) => ({
                    key: p.name,
                    label: p.name,
                    detail: `${p.count}×`,
                    value: p.total,
                    display: formatCOP(p.total),
                  }))}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Agenda</CardTitle>
              <CardDescription>
                {report.appointments.total} citas en el periodo · inasistencia{" "}
                {formatPercent(report.appointments.noShowRate)}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 overflow-x-auto">
              <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {(Object.keys(APPOINTMENT_STATUS) as AppointmentStatus[]).map(
                  (s) => (
                    <div key={s} className="flex gap-1.5">
                      <dt className="text-muted-foreground">
                        {APPOINTMENT_STATUS[s]}
                      </dt>
                      <dd className="font-medium tabular-nums">
                        {report.appointments.byStatus[s]}
                      </dd>
                    </div>
                  ),
                )}
              </dl>
              {report.appointments.byProfessional.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Profesional</TableHead>
                      <TableHead className="text-right">Citas</TableHead>
                      <TableHead className="text-right">Atendidas</TableHead>
                      <TableHead className="text-right">No asistió</TableHead>
                      <TableHead className="text-right">Canceladas</TableHead>
                      <TableHead className="text-right">Asistencia</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.appointments.byProfessional.map((p) => {
                      const resolved = p.attended + p.noShow;
                      return (
                        <TableRow key={p.professional.id}>
                          <TableCell>{p.professional.name}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {p.total}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {p.attended}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {p.noShow}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {p.cancelled}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatPercent(
                              resolved === 0 ? null : p.attended / resolved,
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* La cartera no depende del periodo: es el saldo a hoy. */}
      <Card>
        <CardHeader>
          <CardTitle>Cartera a hoy</CardTitle>
          <CardDescription>
            Por cobrar {formatCOP(receivables.totalOwed)} (
            {receivables.debtorCount}{" "}
            {receivables.debtorCount === 1 ? "paciente" : "pacientes"}) ·
            anticipos de pacientes {formatCOP(receivables.totalAdvances)}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {receivables.debtors.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ningún paciente tiene saldo pendiente.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead className="text-right">Realizado</TableHead>
                  <TableHead className="text-right">Pagado</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Último pago</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receivables.debtors.map((d) => (
                  <TableRow key={d.patientId}>
                    <TableCell>
                      <Link
                        href={`/app/pacientes/${d.patientId}/tratamientos`}
                        className="font-medium text-primary hover:underline"
                      >
                        {d.fullName}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {d.document}
                      </span>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {d.phone ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCOP(d.done)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCOP(d.paid)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCOP(d.balance)}
                    </TableCell>
                    <TableCell>
                      {d.lastPaymentAt
                        ? formatDate(d.lastPaymentAt.slice(0, 10))
                        : "Sin pagos"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Cifra destacada: etiqueta, valor y un detalle de contexto. */
function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="grid gap-1 rounded-xl border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
