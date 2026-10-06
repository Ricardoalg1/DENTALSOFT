import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, getMe } from "@/lib/api";
import type { Professional, ScheduleBlock, Site } from "@/lib/types";
import { ScheduleEditor } from "./schedule-editor";

export const metadata: Metadata = { title: "Horarios de atención" };

export default async function SchedulesPage() {
  const me = await getMe();
  if (me.role !== "ADMIN") {
    return <p className="text-muted-foreground">Solo los administradores pueden editar los horarios.</p>;
  }
  const [professionals, sites, schedules] = await Promise.all([
    api<Professional[]>("/api/professionals"),
    api<Site[]>("/api/sites"),
    api<ScheduleBlock[]>("/api/schedules"),
  ]);
  const activeSites = sites.filter((s) => s.active);

  return (
    <div className="grid max-w-4xl gap-6">
      <Link href="/app/agenda" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Agenda
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Horarios de atención</h1>
        <p className="text-muted-foreground">
          Las citas solo se pueden agendar dentro del horario de cada profesional. Si no tiene horario, no hay restricción.
        </p>
      </div>
      {professionals.length === 0 && (
        <p className="text-muted-foreground">
          No hay profesionales activos. Márcalos en <Link href="/app/equipo" className="text-primary hover:underline">Equipo</Link>.
        </p>
      )}
      {professionals.map((p) => (
        <Card key={p.id}>
          <CardHeader>
            <CardTitle>{p.fullName}</CardTitle>
          </CardHeader>
          <CardContent>
            <ScheduleEditor
              dentistId={p.id}
              sites={activeSites}
              initial={schedules.filter((s) => s.dentistId === p.id)}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
