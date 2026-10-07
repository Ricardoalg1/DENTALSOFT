import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FilePlus2, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api, getMe } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { canReadClinical, canWriteClinical, type Consent } from "@/lib/types";

export const metadata: Metadata = { title: "Consentimientos" };

export default async function ConsentsPage({ params }: PageProps<"/app/pacientes/[id]/consentimientos">) {
  const { id } = await params;
  const me = await getMe();
  if (!canReadClinical(me)) redirect(`/app/pacientes/${id}`);
  const consents = await api<Consent[]>(`/api/patients/${id}/consents`);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Documentos firmados por el paciente o su acudiente. No se pueden modificar; solo revocar.
        </p>
        <div className="flex gap-2">
          {me.role === "ADMIN" && (
            <Link href="/app/historias/plantillas" className={buttonVariants({ variant: "outline" })}>
              <Settings /> Plantillas
            </Link>
          )}
          {canWriteClinical(me) && (
            <Link href={`/app/pacientes/${id}/consentimientos/nuevo`} className={buttonVariants()}>
              <FilePlus2 /> Nuevo consentimiento
            </Link>
          )}
        </div>
      </div>

      {consents.length === 0 ? (
        <p className="text-sm text-muted-foreground">El paciente aún no tiene consentimientos firmados.</p>
      ) : (
        <Card>
          <CardContent>
            <ul className="grid divide-y">
              {consents.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <Link
                      href={`/app/pacientes/${id}/consentimientos/${c.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {c.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(c.signedAt)} · firmó {c.signerName}
                      {c.signerRelationship !== "Paciente" && ` (${c.signerRelationship})`} · {c.professional?.name}
                    </p>
                    {c.procedureDetail && <p className="truncate text-sm">{c.procedureDetail}</p>}
                  </div>
                  {c.revokedAt ? <Badge variant="destructive">Revocado</Badge> : <Badge variant="secondary">Vigente</Badge>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
