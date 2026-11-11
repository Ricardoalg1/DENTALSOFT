import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DicomViewer } from "@/components/dicom-viewer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, getMe } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { canReadClinical, FILE_CATEGORIES, type PatientFile } from "@/lib/types";

export const metadata: Metadata = { title: "Visor de radiografías" };

export default async function DicomViewerPage({ params }: PageProps<"/app/pacientes/[id]/archivos/[fileId]">) {
  const { id, fileId } = await params;
  const me = await getMe();
  if (!canReadClinical(me)) redirect(`/app/pacientes/${id}`);
  const files = await api<PatientFile[]>(`/api/patients/${id}/files`);
  const file = files.find((f) => f.id === fileId);
  if (!file) notFound();
  // Las imágenes y los PDF los abre el navegador directamente.
  if (file.contentType !== "application/dicom" && file.contentType !== "application/zip") redirect(`/bff/files/${file.id}`);

  return (
    <Card>
      <CardHeader className="gap-1">
        <Link href={`/app/pacientes/${id}/archivos`} className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Archivos
        </Link>
        <CardTitle>{file.title}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {FILE_CATEGORIES[file.category]} · {file.uploadedBy?.name ?? "—"} · {formatDateTime(file.createdAt)}
        </p>
      </CardHeader>
      <CardContent>
        <DicomViewer src={`/bff/files/${file.id}`} title={file.title} />
      </CardContent>
    </Card>
  );
}
