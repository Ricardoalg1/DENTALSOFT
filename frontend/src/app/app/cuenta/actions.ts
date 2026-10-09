"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { api } from "@/lib/api";
import { errorMessage, type FormState } from "@/lib/forms";
import { setSession } from "@/lib/session";
import type { TokenResponse } from "@/lib/types";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Ingresa tu contraseña actual"),
    newPassword: z.string().min(8, "Mínimo 8 caracteres").max(72, "Máximo 72 caracteres"),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ["confirm"], message: "Las contraseñas no coinciden" })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ["newPassword"],
    message: "La nueva contraseña debe ser distinta de la actual",
  });

/** Cambia la contraseña y reemplaza la sesión: el token nuevo ya no lleva la restricción de contraseña temporal. */
export async function changePassword(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  try {
    const token = await api<TokenResponse>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword: parsed.data.currentPassword, newPassword: parsed.data.newPassword }),
    });
    await setSession(token.accessToken, token.expiresAt);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect("/app/cuenta?cambiada=1");
}
