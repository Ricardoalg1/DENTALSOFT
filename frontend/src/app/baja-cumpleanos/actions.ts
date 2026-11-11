"use server";

import { z } from "zod";
import { api } from "@/lib/api";

export type OptOutResult = { ok: true; clinicName: string | null } | { ok: false };

/** Retira la autorización de los saludos de cumpleaños con el enlace del correo. */
export async function optOutBirthdayEmails(token: string): Promise<OptOutResult> {
  if (!z.string().min(1).max(100).safeParse(token).success) return { ok: true, clinicName: null };
  try {
    const r = await api<{ clinicName: string | null }>("/api/public/birthday-emails/optout", {
      method: "POST",
      body: JSON.stringify({ token }),
      auth: false,
    });
    return { ok: true, clinicName: r.clinicName };
  } catch {
    return { ok: false };
  }
}
