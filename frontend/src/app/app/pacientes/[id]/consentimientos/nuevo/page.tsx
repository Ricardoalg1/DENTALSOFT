import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { api, getMe } from "@/lib/api";
import { todayCO } from "@/lib/agenda-time";
import { formatLongDate } from "@/lib/format";
import { canWriteClinical, type ConsentTemplate } from "@/lib/types";
import { loadPatient } from "../../load-patient";
import { ConsentForm } from "../consent-form";

export const metadata: Metadata = { title: "Nuevo consentimiento" };

export default async function NewConsentPage({ params }: PageProps<"/app/pacientes/[id]/consentimientos/nuevo">) {
  const { id } = await params;
  const me = await getMe();
  if (!canWriteClinical(me)) redirect(`/app/pacientes/${id}/consentimientos`);
  const [patient, templates] = await Promise.all([loadPatient(id), api<ConsentTemplate[]>("/api/consent-templates")]);

  if (templates.length === 0) {
    return (
      <p className="text-muted-foreground">
        No hay plantillas de consentimiento activas.{" "}
        {me.role === "ADMIN" ? (
          <Link href="/app/historias/plantillas" className="text-primary hover:underline">
            Crear o cargar plantillas
          </Link>
        ) : (
          "Pide a un administrador que las cree."
        )}
      </p>
    );
  }

  return (
    <ConsentForm
      patient={patient}
      templates={templates}
      professionalName={me.fullName}
      clinicName={me.clinicName}
      today={formatLongDate(todayCO())}
    />
  );
}
