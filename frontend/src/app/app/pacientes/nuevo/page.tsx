import type { Metadata } from "next";
import { createPatient } from "../actions";
import { PatientForm } from "../patient-form";

export const metadata: Metadata = { title: "Nuevo paciente" };

export default function NewPatientPage() {
  return (
    <div className="grid max-w-3xl gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Nuevo paciente</h1>
      <PatientForm action={createPatient} cancelHref="/app/pacientes" />
    </div>
  );
}
