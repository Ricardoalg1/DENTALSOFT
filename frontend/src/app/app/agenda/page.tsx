import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock, Users } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { api, ApiError, getMe } from "@/lib/api";
import { canWriteClinical, type Patient, type Professional, type ScheduleBlock, type Site, type TimeOff } from "@/lib/types";
import { Agenda } from "./agenda";

export const metadata: Metadata = { title: "Agenda" };

export default async function AgendaPage({ searchParams }: PageProps<"/app/agenda">) {
  const { patientId } = await searchParams;
  const [me, professionals, sites, schedules, timeOff] = await Promise.all([
    getMe(),
    api<Professional[]>("/api/professionals"),
    api<Site[]>("/api/sites"),
    api<ScheduleBlock[]>("/api/schedules"),
    api<TimeOff[]>("/api/schedules/time-off"),
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
      </div>
      {me.role === "ADMIN" && (
        <section
          aria-label="Horarios de atención"
          className="flex flex-wrap items-center gap-4 rounded-2xl border border-primary/30 bg-primary/10 p-4"
        >
          <span className="relative grid size-14 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground" aria-hidden="true">
            <Users className="size-7" />
            <span className="absolute -bottom-1.5 -right-1.5 grid size-7 place-items-center rounded-full border-2 border-background bg-card text-primary">
              <Clock className="size-4" />
            </span>
          </span>
          <div className="min-w-0 flex-1 basis-64">
            <p className="font-semibold">Aquí configuras los horarios de atención de tus profesionales</p>
            <p className="text-sm text-muted-foreground">
              Define los días y horas en que atiende cada uno, el descanso del almuerzo y las fechas sin atención. Las citas solo se podrán agendar dentro de esos horarios.
            </p>
          </div>
          <Link href="/app/agenda/horarios" className={buttonVariants({ size: "lg" })}>
            <Users /> <Clock /> Configurar horarios <ArrowRight />
          </Link>
        </section>
      )}
      <Agenda
        professionals={professionals}
        sites={sites}
        schedules={schedules}
        timeOff={timeOff}
        presetPatient={presetPatient}
        defaultDentistId={ownAgenda ? me.id : undefined}
        canWriteClinical={canWriteClinical(me)}
      />
    </div>
  );
}
