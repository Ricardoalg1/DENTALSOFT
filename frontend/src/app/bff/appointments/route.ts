import type { NextRequest } from "next/server";
import { bffGet, pick } from "@/lib/bff";

export function GET(request: NextRequest) {
  const params = pick(request.nextUrl.searchParams, ["from", "to", "dentistId", "siteId"]);
  return bffGet(`/api/appointments?${params}`);
}
