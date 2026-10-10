import { z } from "zod";
import { bffForward, bffGet, isSameOrigin } from "@/lib/bff";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "pdf";
  const note = url.searchParams.get("noteId");
  if (
    !z.uuid().safeParse(id).success ||
    !["pdf", "json"].includes(format) ||
    (note && !z.uuid().safeParse(note).success)
  )
    return Response.json({ detail: "Documento inválido" }, { status: 400 });
  const query = new URLSearchParams();
  if (note) query.set("noteId", note);
  if (url.searchParams.get("print") === "true") query.set("print", "true");
  return bffGet(`/api/patients/${id}/clinical-document.${format}?${query}`);
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSameOrigin(request))
    return Response.json({ detail: "Origen no autorizado" }, { status: 403 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return Response.json({ detail: "Paciente inválido" }, { status: 400 });
  const text = await request.text();
  if (text.length > 1024)
    return Response.json(
      { detail: "Solicitud demasiado grande" },
      { status: 413 },
    );
  let parsed;
  try {
    parsed = z
      .object({ operationId: z.uuid(), confirmed: z.literal(true) })
      .safeParse(JSON.parse(text));
  } catch {
    return Response.json({ detail: "Solicitud inválida" }, { status: 400 });
  }
  if (!parsed.success)
    return Response.json({ detail: "Confirma el envío" }, { status: 400 });
  return bffForward(`/api/patients/${id}/clinical-document/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
  });
}
