import { NextResponse, type NextRequest } from "next/server";
import { bffForward, bffGet, isSameOrigin } from "@/lib/bff";

/** Si la clínica puede dictar en línea (Groq) cuando el equipo es lento. */
export function GET() {
  return bffGet("/api/dictation");
}

/** Una frase en WAV (hasta 30 s, menos de 1 MB). El backend valida el formato y el tope mensual. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ detail: "Origen no permitido" }, { status: 403 });
  const body = await request.arrayBuffer();
  return bffForward("/api/dictation/transcribe", {
    method: "POST",
    body,
    headers: { "Content-Type": "audio/wav" },
    signal: AbortSignal.timeout(30000),
  });
}
