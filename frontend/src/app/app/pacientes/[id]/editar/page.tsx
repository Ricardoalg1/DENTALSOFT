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
      <h2 className="text-lg font-semibold">Editar datos del paciente</h2>
      <PatientForm action={updatePatient.bind(null, id)} patient={patient} cancelHref={`/app/pacientes/${id}`} />
    </div>
  );
}
