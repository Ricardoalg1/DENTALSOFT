import type { NextRequest } from "next/server";
import { bffGet, pick } from "@/lib/bff";

/** Descarga del CSV de pagos del periodo (el backend envía Content-Disposition: attachment). */
export function GET(request: NextRequest) {
  const params = pick(request.nextUrl.searchParams, ["from", "to"]);
  return bffGet(`/api/reports/payments.csv?${params}`);
}
