import type { NextRequest } from "next/server";
import { bffGet, pick } from "@/lib/bff";

/** Búsqueda rápida para el selector de pacientes de la agenda. */
export function GET(request: NextRequest) {
  const params = pick(request.nextUrl.searchParams, ["q"]);
  params.set("size", "8");
  return bffGet(`/api/patients?${params}`);
}
