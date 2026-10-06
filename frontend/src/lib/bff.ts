import "server-only";
import { NextResponse } from "next/server";
import { API_URL } from "./api";
import { getToken } from "./session";

/**
 * Backend-for-frontend: los componentes de cliente (p. ej. el calendario) llaman a /bff/* en Next,
 * y Next reenvía al backend con el JWT de la cookie httpOnly. El navegador nunca ve el token.
 */
export async function bffGet(path: string) {
  const token = await getToken();
  if (!token) return NextResponse.json({ detail: "No autenticado" }, { status: 401 });
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return new NextResponse(res.body, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" },
  });
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
