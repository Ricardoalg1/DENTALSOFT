import { bffForward, isSameOrigin } from "@/lib/bff";
const paths: Record<string,string> = { branding: "/api/clinic/document-branding", profile: "/api/users/me/document-profile", logo: "/api/clinic/document-branding/logo", signature: "/api/users/me/document-profile/signature" };
async function forward(request: Request, context: { params: Promise<{ kind: string }> }) {
  if (!isSameOrigin(request)) return Response.json({ detail: "Origen no autorizado" }, { status: 403 });
  const { kind } = await context.params;
  const upload = kind === "logo" || kind === "signature";
  if (!paths[kind] || (upload ? !["POST","DELETE"].includes(request.method) : request.method !== "PUT")) return Response.json({ detail: "Acción inválida" }, { status: 400 });
  const max = upload ? 1100000 : 4000;
  const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  if (reader) { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if(size > max) { await reader.cancel(); return Response.json({ detail: "Archivo o solicitud demasiado grande" }, { status: 413 }); } chunks.push(value); } }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
  return bffForward(paths[kind], { method: request.method, headers: { "Content-Type": request.headers.get("content-type") ?? "application/json" }, body: request.method === "DELETE" ? undefined : bytes.buffer });
}
export const PUT = forward; export const POST = forward; export const DELETE = forward;
