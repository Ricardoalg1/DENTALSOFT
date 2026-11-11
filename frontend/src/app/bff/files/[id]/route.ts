import type { NextRequest } from "next/server";
import { bffForward } from "@/lib/bff";

/** Muestra un archivo del paciente (radiografía, foto, PDF, firma o serie DICOM) pasando por el backend. */
export async function GET(_: NextRequest, { params }: RouteContext<"/bff/files/[id]">) {
  const { id } = await params;
  // Plazo amplio: una serie DICOM de decenas de MB tarda en llegar con una conexión lenta.
  return bffForward(`/api/files/${encodeURIComponent(id)}/content`, { method: "GET", signal: AbortSignal.timeout(10 * 60_000) });
}
