import Link from "next/link";
import { ArrowLeft, CalendarPlus, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { api, getMe } from "@/lib/api";
import { ALERT_CONDITIONS, MEDICAL_CONDITIONS, canReadClinical, hasModule, type ClinicalBackground } from "@/lib/types";
import { loadPatient } from "./load-patient";
import { PatientTabs } from "./patient-tabs";

/** Encabezado común de la ficha: nombre, alertas médicas y pestañas. */
export default async function PatientLayout({ children, params }: LayoutProps<"/app/pacientes/[id]">) {
  const { id } = await params;
  const [patient, me] = await Promise.all([loadPatient(id), getMe()]);
  const clinical = canReadClinical(me) && hasModule(me, "CLINICAL_RECORD");
  const treatments = hasModule(me, "TREATMENTS_CASH");
  const background = clinical ? await api<ClinicalBackground>(`/api/patients/${id}/clinical-background`) : null;

  const alerts = [
    ...(background?.conditions.filter((c) => ALERT_CONDITIONS.includes(c)).map((c) => MEDICAL_CONDITIONS[c]) ?? []),
    ...(background?.allergies ? [`Alergias: ${background.allergies}`] : []),
  ];

  return (
    <div className="grid max-w-5xl gap-6">
      <Link href="/app/pacientes" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Pacientes
      </Link>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
              {patient.fullName}
              {!patient.active && <Badge variant="outline">Inactivo</Badge>}
              {patient.age < 18 && <Badge variant="secondary">Menor de edad</Badge>}
            </h1>
            <p className="text-muted-foreground tabular-nums">
              {patient.documentType} {patient.documentNumber} · {patient.age} años
            </p>
          </div>
          {patient.active && (
            <Link href={`/app/agenda?patientId=${id}`} className={buttonVariants()}>
              <CalendarPlus /> Agendar cita
            </Link>
          )}
        </div>

        {alerts.length > 0 && (
          <div
            role="note"
            aria-label="Alertas médicas"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p>{alerts.join(" · ")}</p>
          </div>
        )}
        {background && !background.updatedAt && (
          <p className="text-sm text-muted-foreground">
            Sin antecedentes médicos registrados.{" "}
            <Link href={`/app/pacientes/${id}/historia/antecedentes`} className="text-primary hover:underline">
              Registrarlos
            </Link>
          </p>
        )}
      </div>

      <PatientTabs patientId={id} clinical={clinical} treatments={treatments} />
      {children}
    </div>
  );
}
