import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { api, ApiError, getMe } from "@/lib/api";
import type { TreatmentPlan } from "@/lib/types";
import { CreateInvoiceForm } from "./create-form";

export const metadata: Metadata = { title: "Nuevo borrador de factura" };

export default async function NewInvoicePage({ searchParams }: PageProps<"/app/facturacion/nuevo">) {
  const me = await getMe();
  if (me.role !== "ADMIN") redirect("/app");
  const query = await searchParams;
  if (!z.uuid().safeParse(query.planId).success) notFound();
  const planId = query.planId as string;
  let plan: TreatmentPlan;
  let eligible: string[];
  try {
    [plan, eligible] = await Promise.all([api<TreatmentPlan>(`/api/treatment-plans/${planId}`), api<string[]>(`/api/treatment-plans/${planId}/billable-items`)]);
  } catch (e) { if (e instanceof ApiError && e.status === 404) notFound(); throw e; }
  return <div className="mx-auto grid max-w-3xl gap-5"><Link href={`/app/pacientes/${plan.patient.id}/tratamientos`} className="text-sm text-primary hover:underline">Volver a tratamientos</Link><header><h1 className="text-2xl font-semibold">Nuevo borrador de factura</h1><p className="text-muted-foreground">{plan.patient.name} · {plan.title}</p></header><CreateInvoiceForm planId={planId} items={plan.items.filter(i => eligible.includes(i.id))} /></div>;
}
