import { NextResponse } from "next/server";
import { z } from "zod";
import { api, ApiError, getMe } from "@/lib/api";
import type { Invoice, RipsPreview } from "@/lib/billing";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (me.role !== "ADMIN") return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Documento inválido" }, { status: 400 });
  try {
    const [invoice, preview] = await Promise.all([api<Invoice>(`/api/invoices/${id}`), api<RipsPreview>(`/api/invoices/${id}/rips-preview`)]);
    if (invoice.status !== "PREPARED" || !preview.validation.dataReady) return NextResponse.json({ error: "Prepara el documento antes de exportar el borrador" }, { status: 409 });
    return new Response(JSON.stringify(preview.payload, null, 2), { headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="RIPS_BORRADOR_OCL-${invoice.draftNumber}.json"`,
      "Cache-Control": "no-store", "X-Document-State": "DRAFT",
    } });
  } catch (e) {
    if (e instanceof ApiError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
