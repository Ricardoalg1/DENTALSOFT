import type { Metadata } from "next";
import { NativeSelect } from "@/components/native-select";
import { EventList } from "@/components/platform/event-list";
import { Pager, pageParam } from "@/components/platform/pager";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { SEVERITY_LABELS, type EventRow } from "@/lib/platform";
import type { Page } from "@/lib/types";

export const metadata: Metadata = { title: "Eventos · Plataforma" };

export default async function EventsPage({ searchParams }: PageProps<"/app/plataforma/eventos">) {
  const sp = await searchParams;
  const severity = typeof sp.severity === "string" && Object.hasOwn(SEVERITY_LABELS, sp.severity) ? sp.severity : "";
  const page = pageParam(sp.page);
  const qs = new URLSearchParams({ page: String(page), size: "30" });
  if (severity) qs.set("severity", severity);
  const data = await api<Page<EventRow>>(`/api/platform/events?${qs}`);
  const hrefFor = (p1: number) => `/app/plataforma/eventos?${new URLSearchParams({ page: String(p1), ...(severity ? { severity } : {}) })}`;
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Línea de tiempo de lo que pasa en las cuentas: altas, pruebas que terminan, pagos, mora y suspensiones. Cada hecho aparece una sola vez.
      </p>
      <form className="flex items-end gap-3">
        <NativeSelect name="severity" label="Importancia" defaultValue={severity} placeholder="Todas" options={SEVERITY_LABELS} />
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>
      <EventList events={data.content} empty="No hay eventos para este filtro." />
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">{data.totalElements} evento(s)</p>
        <Pager page={data.page} totalPages={data.totalPages} hrefFor={hrefFor} />
      </div>
    </div>
  );
}
