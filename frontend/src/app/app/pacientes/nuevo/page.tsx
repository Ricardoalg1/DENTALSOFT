import Link from "next/link";
import { ArrowLeft, UserRoundPlus } from "lucide-react";
import type { Metadata } from "next";
import { createPatient } from "../actions";
import { PatientForm } from "../patient-form";

export const metadata: Metadata = { title: "Nuevo paciente" };

export default function NewPatientPage() {
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6">
      <Link href="/app/pacientes" className="flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" />Pacientes</Link>
      <div className="flex items-center gap-3"><UserRoundPlus className="size-6 text-primary" aria-hidden="true" /><h1 className="text-2xl font-semibold tracking-tight">Nuevo paciente</h1></div>
      <PatientForm action={createPatient} cancelHref="/app/pacientes" />
    </div>
  );
}
