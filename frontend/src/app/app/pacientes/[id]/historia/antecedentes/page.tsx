import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { api, getMe } from "@/lib/api";
import { canWriteClinical, type ClinicalBackground } from "@/lib/types";
import { BackgroundForm } from "./background-form";

export const metadata: Metadata = { title: "Antecedentes" };

export default async function BackgroundPage({ params }: PageProps<"/app/pacientes/[id]/historia/antecedentes">) {
  const { id } = await params;
  const me = await getMe();
  if (!canWriteClinical(me)) redirect(`/app/pacientes/${id}/historia`);
  const background = await api<ClinicalBackground>(`/api/patients/${id}/clinical-background`);
  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <h2 className="text-lg font-semibold">Antecedentes</h2>
        <p className="text-sm text-muted-foreground">Cada actualización queda registrada en el historial de auditoría.</p>
      </div>
      <BackgroundForm patientId={id} background={background} />
    </div>
  );
}
