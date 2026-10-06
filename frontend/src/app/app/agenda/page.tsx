import type { Metadata } from "next";
import Link from "next/link";
import { Clock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { api, ApiError, getMe } from "@/lib/api";
import type { Patient, Professional, ScheduleBlock, Site } from "@/lib/types";
import { Agenda } from "./agenda";

export const metadata: Metadata = { title: "Agenda" };

export default async function AgendaPage({ searchParams }: PageProps<"/app/agenda">) {
  const { patientId } = await searchParams;
  const [me, professionals, sites, schedules] = await Promise.all([
    getMe(),
    api<Professional[]>("/api/professionals"),
    api<Site[]>("/api/sites"),
    api<ScheduleBlock[]>("/api/schedules"),
  ]);

  // Llegando desde la ficha de un paciente: queda preseleccionado para la próxima cita.
  let presetPatient = null;
  if (typeof patientId === "string") {
    try {
      const p = await api<Patient>(`/api/patients/${encodeURIComponent(patientId)}`);
      if (p.active) presetPatient = { id: p.id, fullName: p.fullName, document: `${p.documentType} ${p.documentNumber}` };
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
    }
  }

  // Un odontólogo ve por defecto su propia agenda.
  const ownAgenda = me.role === "DENTIST" && professionals.some((p) => p.id === me.id);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agenda</h1>
          <p className="text-muted-foreground">Selecciona un espacio para agendar; arrastra una cita para reprogramarla.</p>
        </div>
        {me.role === "ADMIN" && (
          <Link href="/app/agenda/horarios" className={buttonVariants({ variant: "outline" })}>
            <Clock /> Horarios de atención
          </Link>
        )}
      </div>
      <Agenda
        professionals={professionals}
        sites={sites}
        schedules={schedules}
        presetPatient={presetPatient}
        defaultDentistId={ownAgenda ? me.id : undefined}
      />
    </div>
  );
}
