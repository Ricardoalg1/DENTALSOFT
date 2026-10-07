import type { NextRequest } from "next/server";
import { bffGet } from "@/lib/bff";

/** Muestra un archivo del paciente (radiografía, foto, PDF, firma) pasando por el backend. */
export async function GET(_: NextRequest, { params }: RouteContext<"/bff/files/[id]">) {
  const { id } = await params;
  return bffGet(`/api/files/${encodeURIComponent(id)}/content`);
}
