import { EmptyState } from "@/components/app/reference-art";
import { FilePlus2, Phone, CalendarDays, Trophy, CircleX, List, ChartColumn } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import Link from "next/link";
import { api } from "@/lib/api";
import { platformAccess, statuses, type Crm } from "@/lib/marketing";
import { plans } from "@/lib/site";
export const metadata = {
  title: "Comercial",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: PageProps<"/app/comercial">) {
  if (!(await platformAccess()))
    return (
      <div>
        <h1 className="text-2xl font-semibold">CRM de Occlus</h1>
        <p className="mt-4">
          Acceso reservado al equipo de Occlus. Tu usuario debe estar autorizado
          en la configuración del servidor.
        </p>
      </div>
    );
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q.toLowerCase() : "";
  const status = typeof query.status === "string" ? query.status : "";
  const page = Math.min(1000000, Math.max(1, Number(query.page) || 1));
  const due = query.due === "true";
  const filters = new URLSearchParams({
    q: q.slice(0, 160),
    status: Object.hasOwn(statuses, status) ? status : "",
    page: String(Math.trunc(page)),
    size: "25",
    due: String(due),
  });
  const data = await api<Crm>(`/api/marketing/leads?${filters}`);
  const leads = data.leads;
  const href = (p: number) => {
    const params = new URLSearchParams(filters);
    params.set("page", String(p));
    return `/app/comercial?${params}`;
  };
  const pages = Object.entries(
    data.metrics.reduce<Record<string, number>>((a, m) => {
      a[m.path] = (a[m.path] ?? 0) + m.views;
      return a;
    }, {}),
  );
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Comercial · Occlus</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Solicitudes del sitio público y seguimiento del equipo comercial.
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-5">
        {Object.entries(statuses).map(([s, label], index) => (
          <div key={s} className="reference-kpi">
            <div className="flex items-center gap-3"><span className={`reference-icon reference-icon-${["blue", "orange", "purple", "green", "purple"][index]}`}>{(() => { const Icon = [FilePlus2, Phone, CalendarDays, Trophy, CircleX][index]; return <Icon aria-hidden="true" />; })()}</span><p className="text-xs text-muted-foreground">{label}</p></div>
            <p className="mt-2 text-2xl font-semibold">
              {data.counts.find((c) => c.status === s)?.total ?? 0}
            </p>
          </div>
        ))}
      </div>
      {query.erased === "1" && (
        <p
          role="status"
          className="rounded bg-teal-50 p-4 text-sm text-teal-900"
        >
          Solicitud y notas eliminadas.
        </p>
      )}
      <form className="reference-search">
        <input
          name="q"
          defaultValue={q}
          aria-label="Buscar nombre, clínica o correo"
          placeholder="Nombre, clínica o correo"
          className="rounded border p-2"
        />
        <select
          name="status"
          defaultValue={status}
          aria-label="Filtrar estado"
          className="rounded border p-2"
        >
          <option value="">Todos los estados</option>
          {Object.entries(statuses).map(([s, l]) => (
            <option key={s} value={s}>
              {l}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="due" value="true" defaultChecked={due} />
          Seguimientos pendientes hasta hoy
        </label>
        <button className="rounded bg-primary px-4 py-2 text-primary-foreground">
          Filtrar
        </button>
      </form>
      <section className="reference-panel">
        <h2 className="flex items-center gap-3 text-xl font-semibold"><List className="text-primary" />Solicitudes</h2>
        <p className="my-3 text-xs text-muted-foreground">
          {data.total} solicitudes coinciden con los filtros. Los totales por
          estado incluyen todas las solicitudes.
        </p>
        <div className="overflow-x-auto">
          <Table pagination={false} className="w-full text-left text-sm">
            <TableHeader>
              <TableRow className="border-b">
                <TableHead className="p-3">Clínica / contacto</TableHead>
                <TableHead className="p-3">Plan</TableHead>
                <TableHead className="p-3">Estado</TableHead>
                <TableHead className="p-3">Fecha</TableHead>
                <TableHead className="p-3">Seguimiento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((l) => (
                <TableRow key={l.id} className="border-b">
                  <TableCell className="p-3">
                    <Link
                      href={`/app/comercial/${l.id}`}
                      className="font-medium underline"
                    >
                      {l.clinicName}
                    </Link>
                    <p>
                      {l.name} · {l.email}
                    </p>
                  </TableCell>
                  <TableCell className="p-3">
                    {plans.find((p) => p.id === l.plan)?.name ?? "Por definir"}
                  </TableCell>
                  <TableCell className="p-3">{statuses[l.status]}</TableCell>
                  <TableCell className="p-3">
                    {new Date(l.createdAt).toLocaleDateString("es-CO", {
                      timeZone: "America/Bogota",
                    })}
                  </TableCell>
                  <TableCell className="p-3">
                    {l.followUpOn
                      ? new Date(
                          `${l.followUpOn}T12:00:00-05:00`,
                        ).toLocaleDateString("es-CO", {
                          timeZone: "America/Bogota",
                        })
                      : "Sin fecha"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!leads.length && (
          <EmptyState compact kind="commercial" title="No hay solicitudes para este filtro." description="Intenta ajustar los filtros o cambia el rango de búsqueda." />
        )}
        <nav
          className="mt-5 flex items-center gap-4 text-sm"
          aria-label="Páginas de solicitudes"
        >
          {data.page > 1 && (
            <Link className="underline" href={href(data.page - 1)}>
              Anterior
            </Link>
          )}
          <span>
            Página {data.page} de{" "}
            {Math.max(1, Math.ceil(data.total / data.size))}
          </span>
          {data.page * data.size < data.total && (
            <Link className="underline" href={href(data.page + 1)}>
              Siguiente
            </Link>
          )}
        </nav>
      </section>
      <section className="reference-panel">
        <h2 className="flex items-center gap-3 text-xl font-semibold"><ChartColumn className="text-primary" />Vistas de páginas · últimos 30 días</h2>
        <p className="mt-2 text-xs text-muted-foreground">
          Conteos agregados, no visitantes únicos. Sin cookies de analítica. Las
          visitas automatizadas pueden afectar estos valores.
        </p>
        {pages.length ? (
          <ul className="mt-4 space-y-2">
            {pages.map(([p, total]) => (
              <li
                key={p}
                className="flex max-w-lg justify-between rounded border p-3 text-sm"
              >
                <span>{p}</span>
                <strong>{total}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact kind="metrics" title="Sin métricas disponibles" description="Su recolección está desactivada por defecto." />
        )}
      </section>
    </div>
  );
}
