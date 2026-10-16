import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FilePlus2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, getMe } from "@/lib/api";
import { ISSUED_KINDS, type IssuedKind, type IssuedSummary } from "@/lib/documents";
import { formatDateTime } from "@/lib/format";
import { canReadClinical, canWriteClinical } from "@/lib/types";

export const metadata: Metadata = { title: "Documentos del paciente" };

export default async function DocumentsPage({ params }: PageProps<"/app/pacientes/[id]/documentos">) {
  const { id } = await params;
  const me = await getMe();
  if (!canReadClinical(me)) redirect(`/app/pacientes/${id}`);
  const docs = await api<IssuedSummary[]>(`/api/patients/${id}/issued-documents`);
  return (
    <div className="grid gap-6">
      {canWriteClinical(me) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(ISSUED_KINDS) as IssuedKind[]).map((k) => (
            <Link key={k} href={`/app/pacientes/${id}/documentos/nuevo?tipo=${k}`} className="flex items-start gap-3 rounded-xl border p-4 transition-colors hover:bg-muted">
              <FilePlus2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="block font-medium">Nueva {ISSUED_KINDS[k].label.toLowerCase()}</span>
                <span className="text-sm text-muted-foreground">{ISSUED_KINDS[k].description}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Documentos emitidos</CardTitle>
          <CardDescription>Incapacidades, remisiones, órdenes y constancias. Quedan firmados y no se editan.</CardDescription>
        </CardHeader>
        <CardContent>
          {docs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay documentos.</p>
          ) : (
            <ul className="divide-y">
              {docs.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <Link href={`/app/pacientes/${id}/documentos/${d.id}`} className="min-w-0 font-medium hover:underline">
                    {d.title}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">{ISSUED_KINDS[d.kind].label}</span>
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(d.issuedAt)} · {d.professional}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
