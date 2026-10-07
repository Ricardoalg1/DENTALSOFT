import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, getMe } from "@/lib/api";
import { canReadClinical, type PatientFile } from "@/lib/types";
import { FileCard } from "./file-card";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = { title: "Archivos del paciente" };

export default async function PatientFilesPage({ params }: PageProps<"/app/pacientes/[id]/archivos">) {
  const { id } = await params;
  const me = await getMe();
  if (!canReadClinical(me)) redirect(`/app/pacientes/${id}`);
  const files = await api<PatientFile[]>(`/api/patients/${id}/files`);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Subir archivo</CardTitle>
          <CardDescription>Radiografías, fotografías intraorales o documentos. Quedan en la historia del paciente.</CardDescription>
        </CardHeader>
        <CardContent>
          <UploadForm patientId={id} />
        </CardContent>
      </Card>

      <section className="grid gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {files.length} {files.length === 1 ? "archivo" : "archivos"}
        </h2>
        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay archivos.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {files.map((f) => (
              <FileCard
                key={f.id}
                patientId={id}
                file={f}
                canRemove={me.role === "ADMIN" || f.uploadedBy?.id === me.id}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
