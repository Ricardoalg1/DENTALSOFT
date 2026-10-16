import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { api, ApiError, getMe } from "@/lib/api";
import { canWriteClinical, type PerioExam } from "@/lib/types";
import { ExamEditor } from "../exam-editor";

export const metadata: Metadata = { title: "Periodontograma" };

/** Editar un borrador propio. Los firmados (o de otro profesional) se ven en la lista. */
export default async function EditExamPage({ params }: PageProps<"/app/pacientes/[id]/periodontograma/[examId]">) {
  const { id, examId } = await params;
  const me = await getMe();
  const listHref = `/app/pacientes/${id}/periodontograma`;
  if (!canWriteClinical(me)) redirect(listHref);

  let exam: PerioExam;
  try {
    exam = await api<PerioExam>(`/api/periodontal-exams/${encodeURIComponent(examId)}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
  if (exam.patient.id !== id) notFound();
  if (exam.status === "SIGNED" || exam.dentist.id !== me.id) redirect(`${listHref}?examen=${exam.id}`);

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-lg font-semibold">Periodontograma (borrador)</h2>
        <p className="text-sm text-muted-foreground">Se guarda como borrador hasta que lo firmes.</p>
      </div>
      <ExamEditor patientId={id} exam={exam} defaultExaminedAt={exam.examinedAt} />
    </div>
  );
}
