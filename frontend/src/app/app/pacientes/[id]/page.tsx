import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, getMe } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { DOCUMENT_TYPES, REGIMES, SEXES, ZONES, type PatientRevision } from "@/lib/types";
import { loadPatient } from "./load-patient";

export const metadata: Metadata = { title: "Paciente" };

const REVISION_LABELS: Record<PatientRevision["type"], string> = {
  CREATED: "Creó el registro",
  UPDATED: "Modificó",
  DELETED: "Eliminó el registro",
};

export default async function PatientPage({ params }: PageProps<"/app/pacientes/[id]">) {
  const { id } = await params;
  const [patient, me] = await Promise.all([loadPatient(id), getMe()]);
  const history = me.role === "ADMIN" ? await api<PatientRevision[]>(`/api/patients/${id}/history`) : null;
  const isMinor = patient.age < 18;

  return (
    <div className="grid max-w-5xl gap-6">
      <Link href="/app/pacientes" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Pacientes
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            {patient.fullName}
            {!patient.active && <Badge variant="outline">Inactivo</Badge>}
            {isMinor && <Badge variant="secondary">Menor de edad</Badge>}
          </h1>
          <p className="text-muted-foreground tabular-nums">
            {patient.documentType} {patient.documentNumber} · {patient.age} años
          </p>
        </div>
        <Link href={`/app/pacientes/${id}/editar`} className={buttonVariants({ variant: "outline" })}>
          <Pencil /> Editar
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <InfoCard
          title="Datos personales"
          rows={[
            ["Documento", `${DOCUMENT_TYPES[patient.documentType]} ${patient.documentNumber}`],
            ["Fecha de nacimiento", formatDate(patient.birthDate)],
            ["Sexo", SEXES[patient.sex]],
            ["Ocupación", patient.occupation],
          ]}
        />
        <InfoCard
          title="Contacto y residencia"
          rows={[
            ["Teléfono", patient.phone],
            ["Correo", patient.email],
            ["Dirección", patient.address],
            ["Municipio", patient.municipality],
            ["Zona", patient.residenceZone && ZONES[patient.residenceZone]],
          ]}
        />
        <InfoCard
          title="Afiliación en salud"
          rows={[
            ["Régimen", REGIMES[patient.regime]],
            ["Aseguradora (EPS)", patient.insurer],
          ]}
        />
        <InfoCard
          title="Acudiente"
          rows={[
            ["Nombre", patient.guardianName],
            ["Teléfono", patient.guardianPhone],
            ["Parentesco", patient.guardianRelationship],
          ]}
        />
      </div>

      {patient.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-line">{patient.notes}</p>
          </CardContent>
        </Card>
      )}

      {history && (
        <Card>
          <CardHeader>
            <CardTitle>Historial de cambios</CardTitle>
            <CardDescription>Registro de auditoría: quién modificó los datos del paciente y cuándo.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-4">
              {history.map((rev) => (
                <li key={rev.revision} className="grid gap-1 border-l-2 pl-3">
                  <p className="text-sm">
                    <span className="font-medium">{rev.userName ?? "Sistema"}</span>{" "}
                    <span className="text-muted-foreground">
                      {REVISION_LABELS[rev.type]} · {formatDateTime(rev.at)}
                    </span>
                  </p>
                  {rev.changes.length > 0 && (
                    <ul className="grid gap-0.5 text-sm text-muted-foreground">
                      {rev.changes.map((c) => (
                        <li key={c.field}>
                          <span className="text-foreground">{c.field}:</span> {c.before ?? "—"} → {c.after ?? "—"}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InfoCard({ title, rows }: { title: string; rows: [string, string | null | undefined][] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[minmax(0,10rem)_1fr] gap-x-4 gap-y-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words">{value || "—"}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
