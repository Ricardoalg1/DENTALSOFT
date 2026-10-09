"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { api } from "@/lib/api";
import { errorMessage, keepValues, type FormState } from "@/lib/forms";
import { clearSession, setSession } from "@/lib/session";
import type { TokenResponse } from "@/lib/types";

const loginSchema = z.object({
  email: z.email("Correo inválido"),
  password: z.string().min(1, "Ingresa tu contraseña"),
});

const registerSchema = z.object({
  clinicName: z.string().trim().min(2, "Nombre de la clínica requerido").max(150),
  nit: z.string().trim().max(20).optional(),
  fullName: z.string().trim().min(2, "Tu nombre es requerido").max(150),
  email: z.email("Correo inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres").max(72),
});

/** Solo se permiten rutas internas del panel para evitar redirecciones abiertas. */
function safeNext(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.startsWith("/app") ? value : "/app";
}

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values: keepValues(formData) };
  }
  try {
    const token = await api<TokenResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(parsed.data),
      auth: false,
    });
    await setSession(token.accessToken, token.expiresAt);
  } catch (e) {
    return { error: errorMessage(e), values: keepValues(formData) };
  }
  redirect(safeNext(formData.get("next")));
}

export async function register(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values: keepValues(formData) };
  }
  try {
    const token = await api<TokenResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(parsed.data),
      auth: false,
    });
    await setSession(token.accessToken, token.expiresAt);
  } catch (e) {
    return { error: errorMessage(e), values: keepValues(formData) };
  }
  redirect("/app");
}

export async function logout() {
  // Cierra la sesión también en el servidor: el token deja de valer aunque alguien lo tuviera copiado.
  // Si ya había vencido o falla la llamada, igual se borra la cookie.
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch {}
  await clearSession();
  redirect("/ingresar");
}
