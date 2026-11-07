"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { api } from "@/lib/api";
import type { BookingSettings } from "@/lib/booking";
import { errorMessage, type FormState } from "@/lib/forms";

const schema = z.object({
  enabled: z.boolean(),
  slug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Solo minúsculas, números y guiones").min(3, "Mínimo 3 caracteres").max(60),
  visitTypes: z.array(z.enum(["FIRST_VISIT", "CONTROL", "TREATMENT", "PREVENTION"])).max(4),
  dentistIds: z.array(z.uuid()).max(200),
  durationMinutes: z.coerce.number().int().min(10, "Mínimo 10 minutos").max(240, "Máximo 240 minutos"),
  minNoticeHours: z.coerce.number().int().min(0).max(720, "Máximo 720 horas"),
  maxDaysAhead: z.coerce.number().int().min(1, "Mínimo 1 día").max(90, "Máximo 90 días"),
});

export async function saveBookingSettings(_: FormState, form: FormData): Promise<FormState> {
  const parsed = schema.safeParse({
    enabled: form.get("enabled") === "on",
    slug: form.get("slug"),
    visitTypes: form.getAll("visitTypes"),
    dentistIds: form.getAll("dentistIds"),
    durationMinutes: form.get("durationMinutes"),
    minNoticeHours: form.get("minNoticeHours"),
    maxDaysAhead: form.get("maxDaysAhead"),
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  try {
    await api<BookingSettings>("/api/online-booking/settings", { method: "PUT", body: JSON.stringify(parsed.data) });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath("/app/agenda/reserva-en-linea");
  return { ok: true };
}
