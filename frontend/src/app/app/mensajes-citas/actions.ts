"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/forms";
import type { VisitType } from "@/lib/types";
import type { ActionResult } from "../agenda/actions";

export type MessageTemplate = {
  visitType: VisitType;
  label: string;
  body: string;
  defaultBody: string;
  custom: boolean;
};

const typeSchema = z.enum(["FIRST_VISIT", "CONTROL", "TREATMENT", "PREVENTION"]);
const bodySchema = z.string().trim().min(1, "Escribe el mensaje").max(2000, "El mensaje admite máximo 2.000 caracteres");

export async function saveTemplate(type: VisitType, body: string): Promise<ActionResult<MessageTemplate>> {
  const t = typeSchema.safeParse(type);
  const b = bodySchema.safeParse(body);
  if (!t.success) return { ok: false, error: "Tipo de cita no válido" };
  if (!b.success) return { ok: false, error: b.error.issues[0].message };
  try {
    const data = await api<MessageTemplate>(`/api/appointment-messages/${t.data}`, {
      method: "PUT",
      body: JSON.stringify({ body: b.data }),
    });
    revalidatePath("/app/mensajes-citas");
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function resetTemplate(type: VisitType): Promise<ActionResult<MessageTemplate>> {
  const t = typeSchema.safeParse(type);
  if (!t.success) return { ok: false, error: "Tipo de cita no válido" };
  try {
    const data = await api<MessageTemplate>(`/api/appointment-messages/${t.data}`, { method: "DELETE" });
    revalidatePath("/app/mensajes-citas");
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
