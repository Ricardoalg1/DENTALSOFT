import { ReferenceArt } from "@/components/app/reference-art";
import { Info, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { api, getMe } from "@/lib/api";
import { formatCOP, formatDateTime, formatReceipt } from "@/lib/format";
import { INVOICE_STATUSES, type Issuer, type InvoiceSummary, type ProviderStatus } from "@/lib/billing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BillingProfileForm } from "./profile-form";
import { DataicoPanel } from "./dataico-panel";

export const metadata: Metadata = { title: "Facturación y RIPS" };

export default async function BillingPage() {
  const me = await getMe();
  if (me.role !== "ADMIN") redirect("/app");
  const [invoices, profile, provider] = await Promise.all([
    api<InvoiceSummary[]>("/api/invoices"), api<Issuer | undefined>("/api/billing/profile"), api<ProviderStatus>("/api/billing/provider"),
  ]);
  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <header><h1 className="text-2xl font-semibold tracking-tight">Facturación y RIPS</h1><p className="text-muted-foreground">Prepara documentos desde los tratamientos realizados y revisa sus datos de salud.</p></header>
      <div className="reference-panel flex items-center gap-5 bg-blue-50/40 text-sm"><span className="reference-icon reference-icon-blue"><Info /></span><div><p className="font-medium">Emisión DIAN pendiente · {provider.name}</p><p className="mt-1 text-muted-foreground">{provider.message}</p></div><ReferenceArt kind="billing" className="ml-auto hidden max-w-48 lg:block" /></div>
      <Card><CardHeader><CardTitle>Conexión Dataico</CardTitle></CardHeader><CardContent><DataicoPanel configured={provider.configured} clinicId={me.clinicId} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Documentos internos</CardTitle></CardHeader><CardContent className="grid gap-4">
        <p className="text-sm">Para crear un documento, abre <Link href="/app/pacientes" className="text-primary hover:underline">un paciente</Link>, entra a Tratamientos y pagos y elige «Preparar factura» en su plan.</p>
        {invoices.length === 0 ? <div className="grid place-items-center gap-2 rounded-xl border border-dashed py-5 text-sm text-muted-foreground"><FileText aria-hidden="true" />Aún no hay documentos.</div> : <ul className="divide-y">{invoices.map(i => <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div><Link href={`/app/facturacion/${i.id}`} className="font-medium text-primary hover:underline">Borrador OCL-{formatReceipt(i.draftNumber)} · {i.patientName}</Link><p className="text-xs text-muted-foreground">{formatDateTime(i.createdAt)}</p></div><span className="text-sm">{INVOICE_STATUSES[i.status]} · {formatCOP(i.total)}</span></li>)}</ul>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Datos fiscales y del prestador</CardTitle></CardHeader><CardContent><BillingProfileForm profile={profile ?? null} /></CardContent></Card>
    </div>
  );
}
