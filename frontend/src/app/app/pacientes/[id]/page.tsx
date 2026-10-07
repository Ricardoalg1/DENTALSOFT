import type { Metadata } from "next";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { AppointmentList } from "@/app/app/agenda/appointment-list";
import { splitByNow } from "@/lib/agenda-time";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, getMe } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { DOCUMENT_TYPES, REGIMES, SEXES, ZONES, type Appointment, type PatientRevision } from "@/lib/types";
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
  const appointments = await api<Appointment[]>(`/api/patients/${id}/appointments`);
  const { upcoming, past: allPast } = splitByNow(appointments);
  const past = allPast.slice(0, 10);
  const history = me.role === "ADMIN" ? await api<PatientRevision[]>(`/api/patients/${id}/history`) : null;

  return (
    <div className="grid gap-6">
      <div className="flex justify-end">
        <Link href={`/app/pacientes/${id}/editar`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Pencil /> Editar datos
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

      <Card>
        <CardHeader>
          <CardTitle>Citas</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <section className="grid gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">Próximas</h3>
            <AppointmentList appointments={upcoming} show="dentist" empty="No tiene citas próximas." />
          </section>
          {past.length > 0 && (
            <section className="grid gap-2">
              <h3 className="text-sm font-medium text-muted-foreground">Anteriores</h3>
              <AppointmentList appointments={past} show="dentist" empty="" />
            </section>
          )}
        </CardContent>
      </Card>

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
