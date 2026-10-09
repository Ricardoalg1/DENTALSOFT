import type { Metadata } from "next";
import Link from "next/link";
import { FormField } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { ActionForm } from "@/components/platform/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { SEVERITY_LABELS, SEVERITY_VARIANT, type AnnouncementRow, type ClinicRow, type Severity } from "@/lib/platform";
import type { Page } from "@/lib/types";
import { archiveAnnouncement, createAnnouncement } from "../actions";

export const metadata: Metadata = { title: "Avisos · Plataforma" };

export default async function AnnouncementsPage() {
  const [rows, clinics] = await Promise.all([
    api<AnnouncementRow[]>("/api/platform/announcements"),
    api<Page<ClinicRow>>("/api/platform/clinics?size=100"),
  ]);
  const active = rows.filter((r) => !r.archivedAt);
  const archived = rows.filter((r) => r.archivedAt);
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
      <div className="grid gap-4">
        <p className="text-sm text-muted-foreground">Mensajes que las clínicas ven como un banner en la parte superior de su aplicación.</p>
        {active.length === 0 && <p className="text-sm text-muted-foreground">No hay avisos publicados.</p>}
        <ul className="grid gap-3">
          {active.map((a) => (
            <li key={a.id}>
              <Card size="sm">
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    {a.title} <Badge variant={SEVERITY_VARIANT[a.level as Severity] ?? "outline"}>{SEVERITY_LABELS[a.level as Severity] ?? a.level}</Badge>
                  </CardTitle>
                  <CardDescription>
                    {a.clinicId ? (
                      <>
                        Solo para{" "}
                        <Link href={`/app/plataforma/clientes/${a.clinicId}`} className="text-primary hover:underline">
                          {a.clinicName}
                        </Link>
                      </>
                    ) : (
                      "Para todas las clínicas"
                    )}
                    {" · "}desde {formatDate(a.startsAt)}
                    {a.endsAt && ` · hasta ${formatDate(a.endsAt)}`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm">
                  <p className="whitespace-pre-line">{a.body}</p>
                  <form action={archiveAnnouncement.bind(null, a.id)}>
                    <Button type="submit" variant="outline" size="sm">
                      Archivar
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
        {archived.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Archivados ({archived.length})</summary>
            <ul className="mt-2 grid gap-1 text-muted-foreground">
              {archived.map((a) => (
                <li key={a.id}>
                  {a.title} · {a.clinicName ?? "todas"} · {formatDate(a.createdAt)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo aviso</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={createAnnouncement} submit="Publicar aviso" pendingLabel="Publicando…">
            <NativeSelect
              name="clinicId"
              label="¿A quién?"
              defaultValue=""
              placeholder="Todas las clínicas"
              options={Object.fromEntries(clinics.content.map((c) => [c.id, c.name]))}
            />
            <FormField name="title" label="Título" required maxLength={120} />
            <div className="grid gap-1.5">
              <Label htmlFor="body">Mensaje</Label>
              <Textarea id="body" name="body" rows={4} required maxLength={1000} />
            </div>
            <NativeSelect name="level" label="Importancia" defaultValue="INFO" options={SEVERITY_LABELS} />
            <FormField name="endsOn" label="Visible hasta (opcional)" type="date" />
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
