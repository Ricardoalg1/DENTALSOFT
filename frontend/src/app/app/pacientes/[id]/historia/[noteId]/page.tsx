import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { api, ApiError, getMe } from "@/lib/api";
import { canWriteClinical, type ClinicalNote } from "@/lib/types";
import { NoteEditor } from "../note-editor";

export const metadata: Metadata = { title: "Evolución" };

/** Editar un borrador propio. Las firmadas (o de otro profesional) se ven en la historia. */
export default async function EditNotePage({ params }: PageProps<"/app/pacientes/[id]/historia/[noteId]">) {
  const { id, noteId } = await params;
  const me = await getMe();
  const historyHref = `/app/pacientes/${id}/historia`;
  if (!canWriteClinical(me)) redirect(historyHref);

  let note: ClinicalNote;
  try {
    note = await api<ClinicalNote>(`/api/clinical-notes/${encodeURIComponent(noteId)}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
  if (note.patient.id !== id) notFound();
  if (note.status === "SIGNED" || note.dentist.id !== me.id) redirect(historyHref);

  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <h2 className="text-lg font-semibold">Evolución (borrador)</h2>
        <p className="text-sm text-muted-foreground">Se guarda como borrador hasta que la firmes.</p>
      </div>
      <NoteEditor patientId={id} note={note} />
    </div>
  );
}
