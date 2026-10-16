import type { NextRequest } from "next/server";
import { bffGet, pick } from "@/lib/bff";

/** Descarga del CSV de un informe del centro de informes. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!/^[a-z-]{2,40}$/.test(key)) return new Response("Informe inválido", { status: 400 });
  const query = pick(request.nextUrl.searchParams, ["from", "to", "siteId"]);
  return bffGet(`/api/reports/tables/${key}.csv?${query}`);
}
