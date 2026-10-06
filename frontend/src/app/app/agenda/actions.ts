"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/forms";
import type { Appointment, ScheduleBlock } from "@/lib/types";

/** Resultado para acciones llamadas desde componentes de cliente (no formularios). */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const appointmentSchema = z.object({
  patientId: z.uuid("Selecciona un paciente"),
  dentistId: z.uuid("Selecciona un profesional"),
  siteId: z.uuid("Selecciona una sede"),
  startsAt: z.iso.datetime({ offset: true, message: "Fecha y hora inválidas" }),
  durationMinutes: z.number().int().min(5).max(480),
  reason: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
});
export type AppointmentInput = z.input<typeof appointmentSchema>;

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Crea (id = null) o edita/reprograma una cita. */
export async function saveAppointment(id: string | null, input: AppointmentInput): Promise<ActionResult<Appointment>> {
  const parsed = appointmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const result = await run(() =>
    api<Appointment>(id ? `/api/appointments/${id}` : "/api/appointments", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(parsed.data),
    }),
  );
  if (result.ok) revalidatePath(`/app/pacientes/${parsed.data.patientId}`);
  return result;
}

const statusSchema = z.object({
  status: z.enum(["SCHEDULED", "CONFIRMED", "ATTENDED", "NO_SHOW", "CANCELLED"]),
  cancellationReason: z.string().trim().max(200).optional(),
});

export async function changeAppointmentStatus(
  id: string,
  input: z.input<typeof statusSchema>,
): Promise<ActionResult<Appointment>> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Estado inválido" };
  return run(() =>
    api<Appointment>(`/api/appointments/${id}/status`, { method: "PATCH", body: JSON.stringify(parsed.data) }),
  );
}

const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Hora inválida");
const scheduleSchema = z.array(
  z.object({
    siteId: z.uuid(),
    dayOfWeek: z.number().int().min(1).max(7),
    startTime: time,
    endTime: time,
  }),
);

export async function saveSchedule(
  dentistId: string,
  blocks: z.input<typeof scheduleSchema>,
): Promise<ActionResult<ScheduleBlock[]>> {
  const parsed = scheduleSchema.safeParse(blocks);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const result = await run(() =>
    api<ScheduleBlock[]>(`/api/schedules/${dentistId}`, {
      method: "PUT",
      body: JSON.stringify({ blocks: parsed.data }),
    }),
  );
  if (result.ok) revalidatePath("/app/agenda", "layout");
  return result;
}
