import { NextResponse, type NextRequest } from "next/server";
import { bffForward, isSameOrigin } from "@/lib/bff";

/**
 * Subida de archivos. Va por un route handler (y no por una Server Action) porque las acciones
 * tienen un límite de 1 MB y una radiografía puede pesar más. El backend valida tipo y tamaño.
 */
export async function POST(request: NextRequest, { params }: RouteContext<"/bff/patients/[id]/files">) {
  if (!isSameOrigin(request)) return NextResponse.json({ detail: "Origen no permitido" }, { status: 403 });
  const { id } = await params;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ detail: "Selecciona un archivo" }, { status: 400 });
  }
  const body = new FormData();
  body.set("file", file, file.name);
  body.set("category", String(form.get("category") ?? "OTHER"));
  const title = String(form.get("title") ?? "").trim();
  if (title) body.set("title", title);
  return bffForward(`/api/patients/${encodeURIComponent(id)}/files`, { method: "POST", body });
}
