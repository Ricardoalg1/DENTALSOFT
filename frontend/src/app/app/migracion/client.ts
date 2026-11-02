/** Llamadas del navegador a /bff/migration/*: devuelven el JSON o lanzan Error con el mensaje del backend. */

async function read<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  if (!res.ok) {
    const problem = body as { detail?: string; title?: string } | undefined;
    if (res.status === 413) throw new Error("El archivo supera el tamaño máximo (15 MB)");
    throw new Error(problem?.detail ?? problem?.title ?? "Ocurrió un error inesperado");
  }
  return body as T;
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.");
  }
  return read<T>(res);
}

export async function postFile<T>(url: string, file: File, fields: Record<string, string> = {}): Promise<T> {
  const form = new FormData();
  form.set("file", file, file.name);
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", body: form });
  } catch {
    throw new Error("No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.");
  }
  return read<T>(res);
}
