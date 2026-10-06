import type { Metadata } from "next";
import { updatePatient } from "../../actions";
import { PatientForm } from "../../patient-form";
import { loadPatient } from "../load-patient";

export const metadata: Metadata = { title: "Editar paciente" };

export default async function EditPatientPage({ params }: PageProps<"/app/pacientes/[id]/editar">) {
  const { id } = await params;
  const patient = await loadPatient(id);
  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Editar paciente</h1>
        <p className="text-muted-foreground">{patient.fullName}</p>
      </div>
      <PatientForm action={updatePatient.bind(null, id)} patient={patient} cancelHref={`/app/pacientes/${id}`} />
    </div>
  );
}
