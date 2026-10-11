import { z } from "zod";
import { bffGet } from "@/lib/bff";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
 const { id } = await params; if(!z.uuid().safeParse(id).success) return Response.json({ detail: "Imagen inválida" }, { status: 400 });
 return bffGet(`/api/document-assets/${id}`);
}
