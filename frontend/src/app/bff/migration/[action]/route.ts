import { NextResponse, type NextRequest } from "next/server";
import { bffForward, isSameOrigin } from "@/lib/bff";

/** Partes del archivo ya asignadas a campos (JSON). Van por aquí y no por Server Actions por el límite de 1 MB. */
const JSON_ACTIONS: Record<string, string> = {
  patients: "/api/migration/patients",
  "clinical-records": "/api/migration/clinical-records",
  batches: "/api/migration/batches",
};

/** Archivos: el Excel/CSV a leer y cada documento de la carpeta del programa anterior. */
const FILE_ACTIONS: Record<string, { path: string; fields: string[] }> = {
  sheet: { path: "/api/migration/sheet", fields: [] },
  documents: { path: "/api/migration/documents", fields: ["batchId", "documentNumber", "documentType", "category"] },
};

/** Migración desde otros programas. El backend exige rol de administrador y valida todo el contenido. */
export async function POST(request: NextRequest, { params }: RouteContext<"/bff/migration/[action]">) {
  if (!isSameOrigin(request)) return NextResponse.json({ detail: "Origen no permitido" }, { status: 403 });
  const { action } = await params;

  const json = JSON_ACTIONS[action];
  if (json) {
    return bffForward(json, {
      method: "POST",
      body: await request.text(),
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(120000),
    });
  }

  const upload = FILE_ACTIONS[action];
  if (!upload) return NextResponse.json({ detail: "No encontrado" }, { status: 404 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ detail: "Selecciona un archivo" }, { status: 400 });
  }
  const body = new FormData();
  body.set("file", file, file.name);
  for (const field of upload.fields) {
    const value = form.get(field);
    if (typeof value === "string" && value) body.set(field, value);
  }
  return bffForward(upload.path, { method: "POST", body, signal: AbortSignal.timeout(120000) });
}
