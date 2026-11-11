import { NextResponse, type NextRequest } from "next/server";
import { bffForward, isSameOrigin } from "@/lib/bff";

/** Tope del cuerpo: una serie DICOM en ZIP de hasta 90 MB más los campos del formulario. */
const MAX_BODY = 91 * 1024 * 1024;

/**
 * Subida de archivos. Va por un route handler (y no por una Server Action) porque las acciones
 * tienen un límite de 1 MB y una radiografía o una serie DICOM pesa más. El cuerpo se reenvía en flujo,
 * sin cargarlo en memoria; el backend valida campos, tipo y tamaño.
 */
export async function POST(request: NextRequest, { params }: RouteContext<"/bff/patients/[id]/files">) {
  if (!isSameOrigin(request)) return NextResponse.json({ detail: "Origen no permitido" }, { status: 403 });
  const { id } = await params;
  const type = request.headers.get("content-type") ?? "";
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!type.startsWith("multipart/form-data") || !request.body) {
    return NextResponse.json({ detail: "Selecciona un archivo" }, { status: 400 });
  }
  if (!Number.isFinite(length) || length > MAX_BODY) {
    return NextResponse.json({ detail: "El archivo supera 90 MB" }, { status: 413 });
  }
  return bffForward(`/api/patients/${encodeURIComponent(id)}/files`, {
    method: "POST",
    body: request.body,
    headers: { "Content-Type": type },
    // Revisar un ZIP grande toma unos segundos más que una imagen suelta.
    signal: AbortSignal.timeout(5 * 60_000),
    duplex: "half",
  } as RequestInit);
}
