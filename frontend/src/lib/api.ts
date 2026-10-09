import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getToken } from "./session";
import type { Me } from "./types";

export const API_URL = process.env.API_URL ?? "http://localhost:8080";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public requestId?: string,
    /** Código de negocio del backend (p. ej. MODULE_DISABLED, SUBSCRIPTION_INACTIVE). */
    public code?: string,
    public module?: string,
  ) {
    super(message);
  }
}

/** Los tres 403 que significan "tu cuenta cambió": se resuelven con una pantalla, no con un error genérico. */
const ENTITLEMENT_CODES = new Set(["SUBSCRIPTION_INACTIVE", "MODULE_DISABLED", "PASSWORD_CHANGE_REQUIRED"]);

type ApiInit = RequestInit & { auth?: boolean };

/**
 * Llama al backend desde el servidor de Next.js (Server Components y Server Actions).
 * Adjunta el JWT de la cookie y convierte los errores RFC 9457 del backend en ApiError.
 */
export async function api<T>(
  path: string,
  { auth = true, headers, ...init }: ApiInit = {},
): Promise<T> {
  const h = new Headers(headers);
  if (init.body && !h.has("Content-Type"))
    h.set("Content-Type", "application/json");
  if (auth) {
    const token = await getToken();
    if (!token) redirect("/ingresar");
    h.set("Authorization", `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(30000),
      headers: h,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      503,
      "No pudimos confirmar la respuesta del servidor. Revisa el estado de la operación antes de intentarlo nuevamente.",
    );
  }

  // Token vencido o inválido: /salir borra la cookie y lleva al login.
  if (res.status === 401 && auth) redirect("/salir");
  if (!res.ok) {
    let message = "Ocurrió un error inesperado";
    let code: string | undefined;
    let moduleKey: string | undefined;
    try {
      const problem = await res.json();
      message = problem.detail ?? problem.title ?? message;
      if (typeof problem.code === "string") code = problem.code;
      if (typeof problem.module === "string") moduleKey = problem.module;
    } catch {}
    // Lecturas (páginas): si la suscripción o el módulo cambiaron con la sesión abierta, se muestra la
    // pantalla correspondiente. Las escrituras (acciones) devuelven el mensaje para mostrarlo en el formulario.
    const isRead = !init.method || init.method === "GET";
    if (auth && isRead && code && ENTITLEMENT_CODES.has(code)) {
      redirect(code === "MODULE_DISABLED" ? `/app/modulo?m=${encodeURIComponent(moduleKey ?? "")}` : "/app");
    }
    const requestId = res.headers.get("X-Occlus-Request-Id");
    throw new ApiError(
      res.status,
      message,
      requestId && /^[0-9a-f-]{36}$/i.test(requestId) ? requestId : undefined,
      code,
      moduleKey,
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Usuario actual; `cache` evita repetir la llamada dentro de un mismo render. */
export const getMe = cache(() => api<Me>("/api/auth/me"));
