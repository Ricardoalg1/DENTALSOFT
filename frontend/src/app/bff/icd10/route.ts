import type { NextRequest } from "next/server";
import { bffGet, pick } from "@/lib/bff";

/** Búsqueda de diagnósticos CIE-10 para el editor de evoluciones. */
export function GET(request: NextRequest) {
  return bffGet(`/api/icd10?${pick(request.nextUrl.searchParams, ["q"])}`);
}
