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
  ) {
    super(message);
  }
}

type ApiInit = RequestInit & { auth?: boolean };

/**
 * Llama al backend desde el servidor de Next.js (Server Components y Server Actions).
 * Adjunta el JWT de la cookie y convierte los errores RFC 9457 del backend en ApiError.
 */
export async function api<T>(path: string, { auth = true, headers, ...init }: ApiInit = {}): Promise<T> {
  const h = new Headers(headers);
  if (init.body && !h.has("Content-Type")) h.set("Content-Type", "application/json");
  if (auth) {
    const token = await getToken();
    if (!token) redirect("/ingresar");
    h.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_URL}${path}`, { ...init, headers: h, cache: "no-store" });

  // Token vencido o inválido: /salir borra la cookie y lleva al login.
  if (res.status === 401 && auth) redirect("/salir");
  if (!res.ok) {
    let message = "Ocurrió un error inesperado";
    try {
      const problem = await res.json();
      message = problem.detail ?? problem.title ?? message;
    } catch {}
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Usuario actual; `cache` evita repetir la llamada dentro de un mismo render. */
export const getMe = cache(() => api<Me>("/api/auth/me"));
