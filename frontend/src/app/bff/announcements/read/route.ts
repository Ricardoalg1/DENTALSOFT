import { NextResponse, type NextRequest } from "next/server";
import { bffForward, isSameOrigin } from "@/lib/bff";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Marca como leído un mensaje (`?id=`) o todos (sin parámetros). */
export function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ detail: "Origen no permitido" }, { status: 403 });
  const id = request.nextUrl.searchParams.get("id");
  if (id && !UUID.test(id)) return NextResponse.json({ detail: "Identificador inválido" }, { status: 400 });
  return bffForward(id ? `/api/announcements/${id}/read` : "/api/announcements/read-all", { method: "POST" });
}
