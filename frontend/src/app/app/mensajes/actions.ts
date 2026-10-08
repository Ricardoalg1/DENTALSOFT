"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { api, ApiError, getMe } from "@/lib/api";
import { errorMessage } from "@/lib/forms";
import type { MessagingSettings } from "@/lib/messaging";

type Result = { ok: true; queued?: number } | { ok: false; error: string };
async function staff() {
  const me = await getMe();
  if (!["ADMIN", "RECEPTION"].includes(me.role)) throw new ApiError(403, "Solo administración y recepción pueden gestionar mensajes");
  return me;
}
function refresh() { revalidatePath("/app/mensajes"); revalidatePath("/app/agenda"); revalidatePath("/app/pacientes", "layout"); }
export async function saveMessagingSettings(input: MessagingSettings): Promise<Result> {
  const parsed = z.object({ remindersEnabled: z.boolean(), hoursBefore: z.number().int().min(2).max(72), aiEnabled: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Selecciona entre 2 y 72 horas de anticipación" };
  try {
    if ((await staff()).role !== "ADMIN") throw new ApiError(403, "Solo administradores pueden configurar el canal");
    await api("/api/messaging/settings", { method: "PUT", body: JSON.stringify(parsed.data) }); refresh(); return { ok: true };
  } catch (e) { unstable_rethrow(e); return { ok: false, error: errorMessage(e) }; }
}
export async function runMessaging(): Promise<Result> {
  try {
    await staff(); const result = await api<{ queued: number }>("/api/messaging/run", { method: "POST" }); refresh(); return { ok: true, queued: result.queued };
  } catch (e) { unstable_rethrow(e); return { ok: false, error: errorMessage(e) }; }
}
export async function simulateReply(reminderId: string, text: string): Promise<Result> {
  if (!z.uuid().safeParse(reminderId).success || !text.trim() || text.length > 2000) return { ok: false, error: "Selecciona un recordatorio e indica una respuesta de hasta 2000 caracteres" };
  try { await staff(); await api("/api/messaging/simulate", { method: "POST", body: JSON.stringify({ reminderId, text }) }); refresh(); return { ok: true }; }
  catch (e) { unstable_rethrow(e); return { ok: false, error: errorMessage(e) }; }
}
export async function resolveMessage(id: string, note: string): Promise<Result> {
  if (!z.uuid().safeParse(id).success || note.trim().length < 3 || note.length > 300) return { ok: false, error: "Describe cómo se atendió el mensaje (3 a 300 caracteres)" };
  try { await staff(); await api(`/api/messaging/messages/${id}/resolve`, { method: "POST", body: JSON.stringify({ note }) }); refresh(); return { ok: true }; }
  catch (e) { unstable_rethrow(e); return { ok: false, error: errorMessage(e) }; }
}
