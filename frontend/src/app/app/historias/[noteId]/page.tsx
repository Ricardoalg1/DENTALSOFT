import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FileText, ShieldCheck, ShieldAlert, ArrowLeft } from "lucide-react";
import { ClinicalDocumentToolbar } from "@/components/clinical-document-toolbar";
import { api, ApiError, getMe } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import {
  canReadClinical,
  DIAGNOSIS_TYPES,
  type ClinicalNote,
} from "@/lib/types";
export const metadata = { title: "Documento clínico" };
export default async function NoteDocument({
  params,
}: PageProps<"/app/historias/[noteId]">) {
  const me = await getMe();
  if (!canReadClinical(me)) redirect("/app");
  const { noteId } = await params;
  let note: ClinicalNote;
  try {
    note = await api<ClinicalNote>(
      `/api/clinical-notes/${encodeURIComponent(noteId)}`,
    );
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 400 || error.status === 404)
    )
      notFound();
    throw error;
  }
  if (note.status !== "SIGNED")
    redirect(`/app/pacientes/${note.patient.id}/historia/${note.id}`);
  const fields = [
    ["Motivo de consulta", note.reason],
    ["Enfermedad actual", note.currentIllness],
    ["Examen y hallazgos", note.examination],
    [
      "Diagnóstico principal",
      note.diagnosisMain &&
        `${note.diagnosisMain.display} · ${note.diagnosisMain.description}`,
    ],
    [
      "Tipo de diagnóstico",
      note.diagnosisType && DIAGNOSIS_TYPES[note.diagnosisType],
    ],
    [
      "Diagnósticos relacionados",
      note.diagnosisRelated
        .map((d) => `${d.display} · ${d.description}`)
        .join("\n"),
    ],
    ["Procedimientos", note.procedures],
    ["Plan e indicaciones", note.plan],
  ];
  return (
    <div className="mx-auto grid max-w-4xl gap-5">
      <Link
        href="/app/historias"
        className="no-print flex items-center gap-2 text-sm text-primary"
      >
        <ArrowLeft className="size-4" />
        Volver a historias
      </Link>
      <ClinicalDocumentToolbar
        patientId={note.patient.id}
        noteId={note.id}
        emailEnabled={false}
      />
      <article className="clinical-paper rounded-sm border bg-card p-6 shadow-lg sm:p-12">
        <header className="mb-8 border-b-2 border-primary pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            {me.clinicName} · Occlus
          </p>
          <h1 className="mt-4 flex items-center gap-3 text-2xl font-semibold">
            <FileText className="size-6" />
            Evolución clínica
          </h1>
          <p className="mt-5 text-lg font-medium">{note.patient.name}</p>
          <div className="mt-2 flex flex-wrap justify-between gap-3 text-sm text-muted-foreground">
            <span>{formatDateTime(note.attendedAt)}</span>
            <span>Profesional: {note.dentist.name}</span>
          </div>
        </header>
        <div className="grid gap-7">
          {fields
            .filter(([, text]) => text)
            .map(([title, text]) => (
              <section key={title}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {title}
                </h2>
                <p className="whitespace-pre-wrap break-words text-sm leading-7">
                  {text}
                </p>
              </section>
            ))}
        </div>
        {note.addenda.map((item) => (
          <section
            key={item.id}
            className="mt-8 border-l-2 border-primary pl-4"
          >
            <h2 className="text-sm font-semibold">Nota aclaratoria</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-7">
              {item.text}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {item.author.name} · {formatDateTime(item.createdAt)}
            </p>
          </section>
        ))}
        <footer className="mt-10 grid gap-2 border-t pt-5 text-xs text-muted-foreground">
          <p>Firmada el {note.signedAt && formatDateTime(note.signedAt)}</p>
          <p className="flex items-center gap-2">
            {note.integrityOk ? (
              <ShieldCheck className="size-4" />
            ) : (
              <ShieldAlert className="size-4 text-destructive" />
            )}
            {note.integrityOk
              ? "Integridad verificada"
              : "Integridad no verificada"}
          </p>
          <p className="break-all font-mono text-[10px]">
            SHA-256: {note.contentHash}
          </p>
          <p>
            Documento confidencial · Las correcciones se registran mediante
            notas aclaratorias.
          </p>
          <Link
            className="no-print mt-3 text-primary"
            href={`/app/pacientes/${note.patient.id}/historia`}
          >
            Ver antecedentes y otras evoluciones del paciente
          </Link>
        </footer>
      </article>
    </div>
  );
}
