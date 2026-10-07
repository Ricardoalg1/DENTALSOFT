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
import { Odontogram } from "./odontogram";

export const metadata: Metadata = { title: "Odontograma" };

export default async function OdontogramPage({ params, searchParams }: PageProps<"/app/pacientes/[id]/odontograma">) {
  const [{ id }, { at }] = await Promise.all([params, searchParams]);
  const me = await getMe();
  if (!canReadClinical(me)) redirect(`/app/pacientes/${id}`);

  // ?at=2026-09-15 → el odontograma tal como estaba al final de ese día (hora de Colombia).
  const date = typeof at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(at) ? at : null;
  const query = date ? `?at=${encodeURIComponent(`${date}T23:59:59-05:00`)}` : "";
  const [entries, history] = await Promise.all([
    api<OdontogramEntry[]>(`/api/patients/${id}/odontogram${query}`),
    api<OdontogramEntry[]>(`/api/patients/${id}/odontogram/history`),
  ]);
  const base = `/app/pacientes/${id}/odontograma`;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
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
      <Odontogram key={date ?? "now"} patientId={id} initialEntries={entries} readOnly={!!date || !canWriteClinical(me)} />

      <Card>
        <CardHeader>
          <CardTitle>Historial de cambios</CardTitle>
          <CardDescription>Nada se borra: cada marca queda con quién la registró y quién la quitó.</CardDescription>
        </CardHeader>
        <CardContent>
          <HistoryList entries={history} />
        </CardContent>
      </Card>
    </div>
  );
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
