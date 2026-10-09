import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { EVENT_KIND_LABELS, SEVERITY_LABELS, SEVERITY_VARIANT, type EventRow } from "@/lib/platform";

export function EventList({ events, empty }: { events: EventRow[]; empty: string }) {
  if (events.length === 0) return <p className="py-4 text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y rounded-xl border">
      {events.map((e) => (
        <li key={e.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 p-3 text-sm">
          <Badge variant={SEVERITY_VARIANT[e.severity]}>{SEVERITY_LABELS[e.severity]}</Badge>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{e.title}</p>
            <p className="text-xs text-muted-foreground">
              {EVENT_KIND_LABELS[e.kind] ?? e.kind}
              {e.clinicId && e.clinicName && (
                <>
                  {" · "}
                  <Link href={`/app/plataforma/clientes/${e.clinicId}`} className="text-primary hover:underline">
                    {e.clinicName}
                  </Link>
                </>
              )}
            </p>
          </div>
          <time dateTime={e.at} className="text-xs text-muted-foreground tabular-nums">
            {formatDateTime(e.at)}
          </time>
        </li>
      ))}
    </ul>
  );
}
