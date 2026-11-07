import Link from "next/link";
import { ArrowLeft, UserRoundPlus } from "lucide-react";
import type { Metadata } from "next";
import { api, ApiError } from "@/lib/api";
import type { BookingRequest } from "@/lib/booking";
import { createPatient } from "../actions";
import { PatientForm } from "../patient-form";

export const metadata: Metadata = { title: "Nuevo paciente" };

/** Una sugerencia para ahorrar digitación: quien recibe al paciente revisa nombres y apellidos antes de guardar. */
function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length >= 4) return { firstName: parts[0], middleName: parts[1], firstLastName: parts[2], secondLastName: parts.slice(3).join(" ") };
  if (parts.length === 3) return { firstName: parts[0], firstLastName: parts[1], secondLastName: parts[2] };
  return { firstName: parts[0], firstLastName: parts[1] ?? "" };
}

export default async function NewPatientPage({ searchParams }: PageProps<"/app/pacientes/nuevo">) {
  const { solicitud } = await searchParams;
  let request: BookingRequest | null = null;
  if (typeof solicitud === "string" && /^[0-9a-f-]{36}$/i.test(solicitud)) {
    try {
      request = await api<BookingRequest>(`/api/online-booking/requests/${solicitud}`);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
    }
  }
  const back = request ? "/app/agenda/solicitudes" : "/app/pacientes";
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6">
      <Link href={back} className="flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" />{request ? "Solicitudes en línea" : "Pacientes"}</Link>
      <div className="flex items-center gap-3"><UserRoundPlus className="size-6 text-primary" aria-hidden="true" /><h1 className="text-2xl font-semibold tracking-tight">Nuevo paciente</h1></div>
      {request && <p role="status" className="text-sm text-muted-foreground">Datos de la solicitud en línea. Revisa nombres y apellidos. Al guardar, vuelve a la bandeja: el paciente aparecerá como coincidencia.</p>}
      <PatientForm action={createPatient} cancelHref={back} initial={request ? { ...splitName(request.fullName), phone: request.phone, email: request.email } : undefined} />
    </div>
  );
}
