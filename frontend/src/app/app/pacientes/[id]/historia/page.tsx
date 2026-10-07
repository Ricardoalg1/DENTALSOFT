import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FilePlus2, Pencil, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, getMe } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import {
  DIAGNOSIS_TYPES,
  HABITS,
  MEDICAL_CONDITIONS,
  canReadClinical,
  canWriteClinical,
  type ClinicalBackground,
  type ClinicalNote,
} from "@/lib/types";
import { AddendumForm } from "./addendum-form";

export const metadata: Metadata = { title: "Historia clínica" };

export default async function ClinicalRecordPage({ params }: PageProps<"/app/pacientes/[id]/historia">) {
  const { id } = await params;
  const me = await getMe();
  if (!canReadClinical(me)) redirect(`/app/pacientes/${id}`);
  const [background, notes] = await Promise.all([
    api<ClinicalBackground>(`/api/patients/${id}/clinical-background`),
    api<ClinicalNote[]>(`/api/patients/${id}/clinical-notes`),
  ]);
  const canWrite = canWriteClinical(me);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Antecedentes</CardTitle>
          <CardDescription>
            {background.updatedAt
              ? `Actualizados por ${background.updatedBy?.name ?? "—"} · ${formatDateTime(background.updatedAt)}`
              : "Aún no se han registrado."}
          </CardDescription>
          {canWrite && (
            <CardAction>
              <Link href={`/app/pacientes/${id}/historia/antecedentes`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Pencil /> {background.updatedAt ? "Actualizar" : "Registrar"}
              </Link>
            </CardAction>
          )}
        </CardHeader>
        {background.updatedAt && (
          <CardContent>
            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(0,12rem)_1fr]">
              <Row label="Antecedentes médicos">
                {background.conditions.length ? background.conditions.map((c) => MEDICAL_CONDITIONS[c]).join(", ") : "Niega"}
              </Row>
              <Row label="Alergias">{background.allergies ?? "Niega"}</Row>
              <Row label="Medicamentos">{background.medications}</Row>
              <Row label="Quirúrgicos / hospitalizaciones">{background.surgicalHistory}</Row>
              <Row label="Familiares">{background.familyHistory}</Row>
              <Row label="Hábitos">{background.habits.map((h) => HABITS[h]).join(", ")}</Row>
              <Row label="Observaciones">{background.observations}</Row>
            </dl>
          </CardContent>
        )}
      </Card>

      <section className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Evoluciones</h2>
          {canWrite && (
            <Link href={`/app/pacientes/${id}/historia/nueva`} className={buttonVariants()}>
              <FilePlus2 /> Nueva evolución
            </Link>
          )}
        </div>
        {notes.length === 0 && <p className="text-sm text-muted-foreground">El paciente aún no tiene evoluciones registradas.</p>}
        {notes.map((note) => (
          <NoteCard key={note.id} note={note} patientId={id} isAuthor={note.dentist.id === me.id} canWrite={canWrite} />
        ))}
      </section>
    </div>
  );
}

function NoteCard({ note, patientId, isAuthor, canWrite }: { note: ClinicalNote; patientId: string; isAuthor: boolean; canWrite: boolean }) {
  const signed = note.status === "SIGNED";
  return (
    <Card className={signed ? undefined : "border-dashed"}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {formatDateTime(note.attendedAt)}
          {signed ? <Badge variant="secondary">Firmada</Badge> : <Badge variant="outline">Borrador</Badge>}
        </CardTitle>
        <CardDescription>
          {note.dentist.name}
          {signed && note.signedAt && ` · firmada el ${formatDateTime(note.signedAt)}`}
        </CardDescription>
        {!signed && isAuthor && canWrite && (
          <CardAction>
            <Link href={`/app/pacientes/${patientId}/historia/${note.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Pencil /> Continuar
            </Link>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(0,12rem)_1fr]">
          <Row label="Motivo de consulta">{note.reason}</Row>
          <Row label="Enfermedad actual">{note.currentIllness}</Row>
          <Row label="Examen / hallazgos">{note.examination}</Row>
          <Row label="Diagnóstico principal">
            {note.diagnosisMain && (
              <>
                <span className="font-medium tabular-nums">{note.diagnosisMain.display}</span> {note.diagnosisMain.description}
                {note.diagnosisType && <span className="text-muted-foreground"> · {DIAGNOSIS_TYPES[note.diagnosisType]}</span>}
              </>
            )}
          </Row>
          <Row label="Relacionados">
            {note.diagnosisRelated.length > 0 &&
              note.diagnosisRelated.map((d) => (
                <span key={d.code} className="block">
                  <span className="font-medium tabular-nums">{d.display}</span> {d.description}
                </span>
              ))}
          </Row>
          <Row label="Procedimientos">{note.procedures}</Row>
          <Row label="Plan e indicaciones">{note.plan}</Row>
        </dl>

        {note.addenda.length > 0 && (
          <div className="grid gap-2 border-l-2 border-primary/40 pl-3">
            <h3 className="text-sm font-medium">Notas aclaratorias</h3>
            {note.addenda.map((a) => (
              <div key={a.id} className="text-sm">
                <p className="whitespace-pre-line">{a.text}</p>
                <p className="text-xs text-muted-foreground">
                  {a.author.name} · {formatDateTime(a.createdAt)}
                </p>
              </div>
            ))}
          </div>
        )}

        {signed && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {note.integrityOk ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground" title={`SHA-256 ${note.contentHash}`}>
                <ShieldCheck className="size-3.5" /> Contenido íntegro desde la firma
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <ShieldAlert className="size-3.5" /> El contenido no coincide con el registrado al firmar
              </p>
            )}
            {canWrite && <AddendumForm patientId={patientId} noteId={note.id} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === "" || children === false) return null;
  return (
    <div className="contents">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 whitespace-pre-line break-words">{children}</dd>
    </div>
  );
}
