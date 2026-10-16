import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/api";
import { canWriteClinical } from "@/lib/types";
import { ExamEditor } from "../exam-editor";

export const metadata: Metadata = { title: "Nuevo periodontograma" };

/** Hora actual en Colombia con offset, p. ej. 2026-10-06T09:30:00-05:00. */
function nowInBogota() {
  const local = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 19);
  return `${local}-05:00`;
}

export default async function NewExamPage({ params }: PageProps<"/app/pacientes/[id]/periodontograma/nuevo">) {
  const { id } = await params;
  const me = await getMe();
  if (!canWriteClinical(me)) redirect(`/app/pacientes/${id}/periodontograma`);
  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-lg font-semibold">Nuevo periodontograma</h2>
        <p className="text-sm text-muted-foreground">Se guarda como borrador hasta que lo firmes.</p>
      </div>
      <ExamEditor patientId={id} defaultExaminedAt={nowInBogota()} />
    </div>
  );
}
