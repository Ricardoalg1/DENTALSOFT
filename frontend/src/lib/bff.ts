import "server-only";
import { NextResponse } from "next/server";
import { API_URL } from "./api";
import { getToken } from "./session";

/**
 * Backend-for-frontend: los componentes de cliente (p. ej. el calendario) llaman a /bff/* en Next,
 * y Next reenvía al backend con el JWT de la cookie httpOnly. El navegador nunca ve el token.
 */
export async function bffGet(path: string) {
  return bffForward(path, { method: "GET" });
}

/** Cabeceras de la respuesta del backend que se reenvían al navegador (p. ej. para archivos). */
const PASSTHROUGH_HEADERS = ["Content-Type", "Content-Length", "Content-Disposition", "Cache-Control", "X-Content-Type-Options"];

export async function bffForward(path: string, init: RequestInit) {
  const token = await getToken();
  if (!token) return NextResponse.json({ detail: "No autenticado" }, { status: 401 });
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_URL}${path}`, { ...init, headers, cache: "no-store" });
  const out = new Headers();
  for (const name of PASSTHROUGH_HEADERS) {
    const value = res.headers.get(name);
    if (value) out.set(name, value);
  }
  if (!out.has("Content-Type")) out.set("Content-Type", "application/json");
  return new NextResponse(res.body, { status: res.status, headers: out });
}

/**
 * Las peticiones que modifican datos deben venir de nuestra propia página (defensa contra CSRF,
 * además de la cookie SameSite=Lax).
 */
export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

/** Copia solo los parámetros permitidos (no se reenvía nada que el cliente invente). */
export function pick(params: URLSearchParams, allowed: string[]) {
  const out = new URLSearchParams();
  for (const key of allowed) {
    const value = params.get(key);
    if (value) out.set(key, value);
  }
  return out;
}
