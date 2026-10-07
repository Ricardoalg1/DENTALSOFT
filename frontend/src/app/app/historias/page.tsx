import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, getMe } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { canReadClinical, type ClinicalNoteSummary } from "@/lib/types";

export const metadata: Metadata = { title: "Historias clínicas" };

export default async function ClinicalNotesPage() {
  const me = await getMe();
  if (!canReadClinical(me)) redirect("/app");
  const [drafts, recent] = await Promise.all([
    me.professional ? api<ClinicalNoteSummary[]>("/api/clinical-notes?scope=my-drafts") : Promise.resolve([]),
    api<ClinicalNoteSummary[]>("/api/clinical-notes"),
  ]);

  return (
    <div className="grid max-w-5xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Historias clínicas</h1>
        <p className="text-muted-foreground">
          Para registrar una atención, abre la ficha del paciente o la cita en la agenda.
        </p>
      </div>

      {me.professional && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Pendientes de firma {drafts.length > 0 && <Badge variant="destructive">{drafts.length}</Badge>}
            </CardTitle>
            <CardDescription>Tus evoluciones en borrador. Mientras no las firmes no hacen parte de la historia clínica.</CardDescription>
          </CardHeader>
          <CardContent>
            <NotesTable notes={drafts} empty="No tienes evoluciones pendientes." draftLinks />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Firmadas recientemente</CardTitle>
          <CardDescription>Últimas 50 evoluciones firmadas en la clínica.</CardDescription>
        </CardHeader>
        <CardContent>
          <NotesTable notes={recent} empty="Aún no hay evoluciones firmadas." />
        </CardContent>
      </Card>
    </div>
  );
}

function NotesTable({ notes, empty, draftLinks }: { notes: ClinicalNoteSummary[]; empty: string; draftLinks?: boolean }) {
  if (notes.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Atención</TableHead>
          <TableHead>Paciente</TableHead>
          <TableHead className="hidden sm:table-cell">Profesional</TableHead>
          <TableHead className="hidden md:table-cell">Diagnóstico</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {notes.map((n) => {
          const href = draftLinks
            ? `/app/pacientes/${n.patient.id}/historia/${n.id}`
            : `/app/pacientes/${n.patient.id}/historia`;
          return (
            <TableRow key={n.id}>
              <TableCell className="tabular-nums">{formatDateTime(n.attendedAt)}</TableCell>
              <TableCell>
                <Link href={href} className="font-medium text-primary hover:underline">
                  {n.patient.name}
                </Link>
                {n.reason && <p className="max-w-64 truncate text-xs text-muted-foreground">{n.reason}</p>}
              </TableCell>
              <TableCell className="hidden sm:table-cell">{n.dentist.name}</TableCell>
              <TableCell className="hidden md:table-cell">
                {n.diagnosisMain ? (
                  <span title={n.diagnosisMain.description}>
                    <span className="tabular-nums">{n.diagnosisMain.display}</span>{" "}
                    <span className="text-muted-foreground">{n.diagnosisMain.description}</span>
                  </span>
                ) : (
                  "—"
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
