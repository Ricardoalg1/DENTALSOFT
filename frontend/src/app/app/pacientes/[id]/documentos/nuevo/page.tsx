import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { api, getMe } from "@/lib/api";
import { ISSUED_KINDS, type IssuedKind } from "@/lib/documents";
import { canWriteClinical } from "@/lib/types";
import { DocumentForm } from "../document-form";

export const metadata: Metadata = { title: "Nuevo documento" };

export default async function NewDocumentPage({ params, searchParams }: PageProps<"/app/pacientes/[id]/documentos/nuevo">) {
  const [{ id }, { tipo }] = await Promise.all([params, searchParams]);
  const me = await getMe();
  if (!canWriteClinical(me)) redirect(`/app/pacientes/${id}/documentos`);
  if (typeof tipo !== "string" || !(tipo in ISSUED_KINDS)) notFound();
  const patient = await api<{ fullName: string; documentType: string; documentNumber: string }>(`/api/patients/${id}`);
  return (
    <div className="grid max-w-3xl gap-4">
      <Link href={`/app/pacientes/${id}/documentos`} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Documentos
      </Link>
      <DocumentForm
        patientId={id}
        patientName={patient.fullName}
        identification={`${patient.documentType} ${patient.documentNumber}`}
        kind={tipo as IssuedKind}
      />
    </div>
  );
}
