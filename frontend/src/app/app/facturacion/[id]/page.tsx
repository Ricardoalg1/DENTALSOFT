import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { api, ApiError, getMe } from "@/lib/api";
import { formatCOP, formatDateTime, formatReceipt } from "@/lib/format";
import { INVOICE_STATUSES, type Invoice, type NoteOption, type RipsPreview } from "@/lib/billing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RipsUserForm, ServiceRipsForm } from "./rips-forms";
import { InvoiceControls } from "./invoice-controls";

export const metadata: Metadata = { title: "Borrador de factura" };

export default async function InvoicePage({ params }: PageProps<"/app/facturacion/[id]">) {
  const me = await getMe();
  if (me.role !== "ADMIN") redirect("/app");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  let invoice: Invoice;
  try { invoice = await api<Invoice>(`/api/invoices/${id}`); }
  catch (e) { if (e instanceof ApiError && e.status === 404) notFound(); throw e; }
  const [preview, notes] = await Promise.all([
    api<RipsPreview>(`/api/invoices/${id}/rips-preview`), invoice.status === "DRAFT" ? api<NoteOption[]>(`/api/invoices/${id}/clinical-notes`) : [],
  ]);
  const draft = invoice.status === "DRAFT";
  return <div className="mx-auto grid max-w-5xl gap-5">
    <Link href="/app/facturacion" className="no-print text-sm text-primary hover:underline">Volver a facturación</Link>
    <header className="grid gap-1"><p className="text-sm uppercase tracking-wide">Documento interno · {INVOICE_STATUSES[invoice.status]}</p><h1 className="text-2xl font-semibold">Borrador OCL-{formatReceipt(invoice.draftNumber)}</h1><p className="text-muted-foreground">{invoice.snapshot.patientName} · {formatDateTime(invoice.createdAt)}</p><p className="text-sm">Pendiente de emisión DIAN. Este consecutivo identifica el borrador interno.</p></header>
    <Card><CardHeader><CardTitle>Servicios a facturar</CardTitle></CardHeader><CardContent className="grid gap-3">
      {invoice.snapshot.lines.map(l => <div key={l.sourceItemId} className="flex flex-wrap justify-between gap-2 border-b pb-3"><div><p className="font-medium">{l.description} × {l.quantity}</p><p className="text-xs text-muted-foreground">CUPS {l.cupsCode ?? "pendiente"}{l.attendedAt && ` · ${formatDateTime(l.attendedAt)} · ${l.diagnosisMain}`}</p></div><span className="tabular-nums">{formatCOP(l.total)}</span></div>)}
      <p className="text-right text-lg font-semibold">Total: {formatCOP(invoice.total)}</p>
      <p className="text-xs text-muted-foreground">Los abonos siguen registrados en Caja; preparar un documento no genera un cobro adicional.</p>
    </CardContent></Card>
    <section className="no-print grid gap-2 rounded-xl border p-4"><h2 className="font-semibold">Revisión local de RIPS</h2><p className="text-xs text-muted-foreground">{preview.standard}</p>{invoice.validation.errors.length > 0 ? <ul className="list-inside list-disc text-sm text-destructive">{invoice.validation.errors.map(e => <li key={e}>{e}</li>)}</ul> : <p className="text-sm text-primary">Datos completos para la comprobación local.</p>}<ul className="list-inside list-disc text-xs text-muted-foreground">{invoice.validation.warnings.map(w => <li key={w}>{w}</li>)}</ul></section>
    {draft && <>
      <Card className="no-print"><CardHeader><CardTitle>Residencia y cobertura del paciente</CardTitle></CardHeader><CardContent><RipsUserForm invoiceId={id} user={invoice.snapshot.user} /></CardContent></Card>
      {invoice.snapshot.lines.map((l, index) => <Card key={l.sourceItemId} className="no-print"><CardHeader><CardTitle>Servicio {index + 1}: {l.description}</CardTitle></CardHeader><CardContent><ServiceRipsForm invoiceId={id} line={l} notes={notes} /></CardContent></Card>)}
      <p className="no-print text-xs text-muted-foreground">Referencia: <a href="https://contenidos.sispro.gov.co/central-financiamiento/Pages/facturacion-electronica.aspx" target="_blank" rel="noreferrer" className="text-primary underline">Documentación y tablas FEV-RIPS de SISPRO</a>.</p>
    </>}
    {invoice.cancelReason && <p className="text-sm text-destructive">Cancelado: {invoice.cancelReason}</p>}
    <InvoiceControls invoice={invoice} />
    <details className="no-print rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">Vista previa del JSON RIPS (borrador)</summary><pre className="mt-3 max-h-96 overflow-auto text-xs">{JSON.stringify(preview.payload, null, 2)}</pre></details>
  </div>;
}
