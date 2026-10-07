import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { api, ApiError, getMe } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import type { Procedure, TreatmentPlan, TreatmentSuggestion } from "@/lib/types";
import { PlanStatusBadge } from "../plan-status-badge";
import { PlanView } from "./plan-view";

export const metadata: Metadata = { title: "Plan de tratamiento" };

export default async function PlanPage({ params }: PageProps<"/app/pacientes/[id]/tratamientos/[planId]">) {
  const { id, planId } = await params;
  const me = await getMe();
  let plan: TreatmentPlan;
  try {
    plan = await api<TreatmentPlan>(`/api/treatment-plans/${encodeURIComponent(planId)}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
  if (plan.patient.id !== id) notFound();

  const draft = plan.status === "DRAFT";
  const [procedures, suggestions] = await Promise.all([
    draft ? api<Procedure[]>("/api/procedures") : [],
    draft && me.professional ? api<TreatmentSuggestion[]>(`/api/patients/${id}/treatment-suggestions`) : [],
  ]);

  return (
    <div className="grid gap-4">
      <Link
        href={`/app/pacientes/${id}/tratamientos`}
        className="no-print inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Tratamientos y pagos
      </Link>

      <header className="grid gap-1">
        <p className="hidden text-xs tracking-wide text-muted-foreground uppercase print:block">
          {me.clinicName} · Presupuesto
        </p>
        <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
          {plan.title} <PlanStatusBadge status={plan.status} />
        </h2>
        <p className="text-sm text-muted-foreground">
          {plan.dentist?.name} · {formatDate(plan.createdAt.slice(0, 10))}
          {plan.validUntil && ` · válido hasta ${formatDate(plan.validUntil)}`}
          {plan.acceptedAt && ` · aceptado el ${formatDateTime(plan.acceptedAt)} (registró ${plan.acceptedBy?.name})`}
        </p>
      </header>

      <PlanView
        patientId={id}
        plan={plan}
        procedures={procedures}
        suggestions={suggestions}
        professional={me.professional}
        isAdmin={me.role === "ADMIN"}
      />
    </div>
  );
}
