"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { api } from "@/lib/api";
import { errorMessage, keepValues, type FormState } from "@/lib/forms";
import { clearChallenge, clearSession, getChallenge, setChallenge, setSession } from "@/lib/session";
import type { LoginResponse, TokenResponse } from "@/lib/types";

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
  const next = safeNext(formData.get("next"));
  let needsCode = false;
  try {
    const result = await api<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(parsed.data),
      auth: false,
    });
    if (result.twoFactorRequired && result.challengeToken) {
      await setChallenge(result.challengeToken);
      needsCode = true;
    } else if (result.accessToken && result.expiresAt) {
      await setSession(result.accessToken, result.expiresAt);
    }
  } catch (e) {
    return { error: errorMessage(e), values: keepValues(formData) };
  }
  redirect(needsCode ? `/ingresar/verificar?next=${encodeURIComponent(next)}` : next);
}

const codeSchema = z.object({ code: z.string().trim().min(6, "Escribe el código").max(32, "Código inválido") });

/** Segundo paso del ingreso. El reto vive en una cookie httpOnly: el JavaScript del navegador no lo ve. */
export async function verifyLogin(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = codeSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const challengeToken = await getChallenge();
  if (!challengeToken) redirect("/ingresar");
  try {
    const token = await api<TokenResponse>("/api/auth/login/verify", {
      method: "POST",
      body: JSON.stringify({ challengeToken, code: parsed.data.code }),
      auth: false,
    });
    await setSession(token.accessToken, token.expiresAt);
    await clearChallenge();
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect(safeNext(formData.get("next")));
}

export async function requestReset(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.object({ email: z.email("Correo inválido").max(160) }).safeParse({ email: formData.get("email") });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values: keepValues(formData) };
  try {
    await api("/api/auth/password-reset/request", { method: "POST", body: JSON.stringify(parsed.data), auth: false });
  } catch (e) {
    return { error: errorMessage(e), values: keepValues(formData) };
  }
  return { ok: true };
}

export async function inspectReset(token: string): Promise<{ valid: boolean; twoFactorRequired: boolean }> {
  try {
    return await api("/api/auth/password-reset/inspect", { method: "POST", body: JSON.stringify({ token: token.slice(0, 100) }), auth: false });
  } catch {
    return { valid: false, twoFactorRequired: false };
  }
}

const resetSchema = z
  .object({
    token: z.string().min(1).max(100),
    newPassword: z.string().min(10, "Mínimo 10 caracteres").max(72, "Máximo 72 caracteres"),
    confirm: z.string(),
    code: z.string().trim().max(32).optional(),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ["confirm"], message: "Las contraseñas no coinciden" });

export async function confirmReset(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  try {
    const { token, newPassword, code } = parsed.data;
    await api("/api/auth/password-reset/confirm", { method: "POST", body: JSON.stringify({ token, newPassword, code: code || undefined }), auth: false });
    // Esta sesión, si había una, ya fue cerrada en el servidor.
    await clearSession();
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect("/ingresar?restablecida=1");
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
