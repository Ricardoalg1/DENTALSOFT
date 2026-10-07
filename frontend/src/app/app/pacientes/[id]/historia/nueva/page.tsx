import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { api, ApiError, getMe } from "@/lib/api";
import { canWriteClinical, type Appointment } from "@/lib/types";
import { NoteEditor } from "../note-editor";

export const metadata: Metadata = { title: "Nueva evolución" };

/** Hora actual en Colombia con offset, p. ej. 2026-10-06T09:30:00-05:00. */
function nowInBogota() {
  const local = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 19);
  return `${local}-05:00`;
}

export default async function NewNotePage({ params, searchParams }: PageProps<"/app/pacientes/[id]/historia/nueva">) {
  const [{ id }, { appointmentId }] = await Promise.all([params, searchParams]);
  const me = await getMe();
  if (!canWriteClinical(me)) redirect(`/app/pacientes/${id}/historia`);

  // Desde la agenda: la evolución queda ligada a la cita y toma su hora y motivo.
  let appointment: Appointment | null = null;
  if (typeof appointmentId === "string") {
    try {
      appointment = await api<Appointment>(`/api/appointments/${encodeURIComponent(appointmentId)}`);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
    }
    if (appointment?.patient.id !== id) appointment = null;
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <h2 className="text-lg font-semibold">Nueva evolución</h2>
        <p className="text-sm text-muted-foreground">
          {appointment ? `Cita con ${appointment.dentist.name} · ${appointment.site.name}. ` : ""}
          Se guarda como borrador hasta que la firmes.
        </p>
      </div>
      <NoteEditor
        patientId={id}
        appointmentId={appointment?.id}
        defaults={{ attendedAt: appointment?.startsAt ?? nowInBogota(), reason: appointment?.reason ?? undefined }}
      />
    </div>
  );
}
