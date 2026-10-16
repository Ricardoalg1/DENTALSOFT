import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, getMe } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { ODONTOGRAM_CONDITIONS, SURFACES, canReadClinical, canWriteClinical, type OdontogramEntry } from "@/lib/types";
import { ClinicDocumentHeader } from "@/components/app/document-identity";
import { Timeline, type TimelineItem } from "@/components/app/timeline";
import { Odontogram } from "./odontogram";

export const metadata: Metadata = { title: "Odontograma" };

export default async function OdontogramPage({ params, searchParams }: PageProps<"/app/pacientes/[id]/odontograma">) {
  const [{ id }, { at }] = await Promise.all([params, searchParams]);
  const me = await getMe();
  if (!canReadClinical(me)) redirect(`/app/pacientes/${id}`);

  // ?at=2026-09-15 → el odontograma tal como estaba al final de ese día (hora de Colombia).
  const date = typeof at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(at) ? at : null;
  const query = date ? `?at=${encodeURIComponent(`${date}T23:59:59-05:00`)}` : "";
  const [patient, entries, history] = await Promise.all([
    api<{ fullName: string; documentType: string; documentNumber: string }>(`/api/patients/${id}`),
    api<OdontogramEntry[]>(`/api/patients/${id}/odontogram${query}`),
    api<OdontogramEntry[]>(`/api/patients/${id}/odontogram/history`),
  ]);
  const base = `/app/pacientes/${id}/odontograma`;

  return (
    <div className="grid gap-6">
      {/* Encabezado que solo aparece al imprimir o guardar en PDF. */}
      <div className="hidden gap-3 print:grid">
        <ClinicDocumentHeader />
        <div>
          <h1 className="text-xl font-semibold">Odontograma</h1>
          <p className="text-sm">
            {patient.fullName} · {patient.documentType} {patient.documentNumber} ·{" "}
            {date ? `estado al ${formatDate(date)}` : `vigente al ${formatDate(new Date().toISOString().slice(0, 10))}`}
          </p>
        </div>
      </div>
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        {date ? (
          <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
            Viendo el odontograma al <strong>{formatDate(date)}</strong> (solo lectura).{" "}
            <Link href={base} className="text-primary hover:underline">
              Volver al actual
            </Link>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Odontograma vigente.</p>
        )}
        {/* Formulario GET: funciona sin JavaScript y deja la fecha en la URL. */}
        <form action={base} className="flex items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="at">Ver cómo estaba el</Label>
            <Input id="at" name="at" type="date" defaultValue={date ?? ""} required className="w-40" />
          </div>
          <Button type="submit" variant="outline">
            <History /> Ver
          </Button>
        </form>
      </div>

      {/* key: al cambiar de fecha se reinicia el estado del componente. */}
      <Odontogram key={date ?? "now"} patientId={id} patientName={patient.fullName} asOf={date} initialEntries={entries} readOnly={!!date || !canWriteClinical(me)} />

      <Card className="no-print">
        <CardHeader>
          <CardTitle>Historial de cambios</CardTitle>
          <CardDescription>Nada se borra: cada marca queda con quién la registró y quién la quitó.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Timeline label="Fechas con cambios en el odontograma" items={timeline(history, base, date)} />
          <HistoryList entries={history} />
        </CardContent>
      </Card>
    </div>
  );
}

/** Día (YYYY-MM-DD, hora de Colombia) de un instante ISO. */
const bogotaDay = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/** Un punto por cada día con cambios (de lo más reciente a lo más antiguo), más el estado actual. */
function timeline(entries: OdontogramEntry[], base: string, date: string | null): TimelineItem[] {
  const changes = new Map<string, number>();
  for (const e of entries) {
    for (const at of [e.createdAt, e.removedAt]) {
      if (!at) continue;
      const day = bogotaDay(at);
      changes.set(day, (changes.get(day) ?? 0) + 1);
    }
  }
  const days = [...changes.entries()].sort(([a], [b]) => b.localeCompare(a));
  return [
    { key: "now", href: base, label: "Actual", detail: "Vigente", active: !date },
    ...days.map(([day, count]) => ({
      key: day,
      href: `${base}?at=${day}`,
      label: formatDate(day),
      detail: `${count} ${count === 1 ? "cambio" : "cambios"}`,
      active: date === day,
    })),
  ];
}

function HistoryList({ entries }: { entries: OdontogramEntry[] }) {
  const events = entries
    .flatMap((e) => [
      { key: `${e.id}+`, at: e.createdAt, who: e.createdBy?.name, action: "Agregó", entry: e },
      ...(e.removedAt ? [{ key: `${e.id}-`, at: e.removedAt, who: e.removedBy?.name, action: "Quitó", entry: e }] : []),
    ])
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 40);
  if (events.length === 0) return <p className="text-sm text-muted-foreground">Sin cambios registrados.</p>;
  return (
    <ol className="grid gap-1.5 text-sm">
      {events.map(({ key, at, who, action, entry }) => (
        <li key={key} className="flex flex-wrap gap-x-2">
          <span className="text-muted-foreground tabular-nums">{formatDateTime(at)}</span>
          <span>
            <span className="font-medium">{who ?? "—"}</span> {action.toLowerCase()} {ODONTOGRAM_CONDITIONS[entry.condition].label.toLowerCase()} en el{" "}
            {entry.tooth}
            {entry.surface && ` (${SURFACES[entry.surface].toLowerCase()})`}
          </span>
        </li>
      ))}
    </ol>
  );
}
