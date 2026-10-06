import { timeOf } from "@/lib/agenda-time";
import { formatDate } from "@/lib/format";
import type { Appointment } from "@/lib/types";
import { StatusBadge } from "./status-badge";

type Props = {
  appointments: Appointment[];
  /** Qué mostrar como título de cada fila. */
  show: "patient" | "dentist";
  showDate?: boolean;
  empty: string;
};

/** Lista compacta de citas (ficha del paciente, inicio). */
export function AppointmentList({ appointments, show, showDate = true, empty }: Props) {
  if (appointments.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="grid divide-y">
      {appointments.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm first:pt-0 last:pb-0">
          <span className="w-28 shrink-0 tabular-nums text-muted-foreground">
            {showDate && <span className="block text-foreground">{formatDate(a.startsAt.slice(0, 10))}</span>}
            {timeOf(a.startsAt)} – {timeOf(a.endsAt)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{show === "patient" ? a.patient.fullName : a.dentist.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {[show === "patient" ? a.dentist.name : null, a.site.name, a.reason].filter(Boolean).join(" · ")}
            </span>
          </span>
          <StatusBadge status={a.status} />
        </li>
      ))}
    </ul>
  );
}
