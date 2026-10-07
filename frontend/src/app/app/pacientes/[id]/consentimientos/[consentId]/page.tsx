import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ShieldAlert, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { api, ApiError, getMe } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { canReadClinical, canWriteClinical, type Consent } from "@/lib/types";
import { ConsentActions } from "./consent-actions";

export const metadata: Metadata = { title: "Consentimiento" };

export default async function ConsentPage({ params }: PageProps<"/app/pacientes/[id]/consentimientos/[consentId]">) {
  const { id, consentId } = await params;
  const me = await getMe();
  if (!canReadClinical(me)) redirect(`/app/pacientes/${id}`);
  let c: Consent;
  try {
    c = await api<Consent>(`/api/consents/${encodeURIComponent(consentId)}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
  if (c.patient.id !== id) notFound();

  return (
    <div className="grid gap-4">
      <Link
        href={`/app/pacientes/${id}/consentimientos`}
        className="no-print inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Consentimientos
      </Link>

      {c.revokedAt && (
        <div role="note" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <strong>Revocado</strong> el {formatDateTime(c.revokedAt)} (registró {c.revokedBy?.name}). Motivo: {c.revocationReason}
        </div>
      )}

      <Card>
        <CardContent className="grid gap-6 print:p-0">
          <header className="grid gap-1">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">{me.clinicName}</p>
            <h2 className="text-xl font-semibold">{c.title}</h2>
            <p className="text-sm text-muted-foreground">Paciente: {c.patient.name}</p>
          </header>

          <div className="text-sm leading-relaxed whitespace-pre-line">{c.body}</div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="grid content-start gap-1 text-sm">
              <div className="h-28 rounded-lg border bg-white p-1">
                {/* eslint-disable-next-line @next/next/no-img-element -- imagen privada servida por el BFF */}
                <img src={`/bff/files/${c.signatureFileId}`} alt={`Firma de ${c.signerName}`} className="h-full w-full object-contain" />
              </div>
              <p className="font-medium">{c.signerName}</p>
              <p className="text-muted-foreground">
                {c.signerDocument} · {c.signerRelationship === "Paciente" ? "Paciente" : `Acudiente (${c.signerRelationship})`}
              </p>
            </div>
            <div className="grid content-end gap-1 text-sm">
              <p className="font-medium">{c.professional?.name}</p>
              <p className="text-muted-foreground">Profesional tratante</p>
              <p className="text-muted-foreground">Firmado el {formatDateTime(c.signedAt)}</p>
            </div>
          </div>

          <footer className="grid gap-1 border-t pt-3 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5">
              {c.integrityOk ? (
                <>
                  <ShieldCheck className="size-4 text-primary" /> Contenido íntegro desde la firma
                </>
              ) : (
                <>
                  <ShieldAlert className="size-4 text-destructive" />
                  <span className="text-destructive">El contenido no coincide con la huella registrada al firmar</span>
                </>
              )}
            </p>
            <p className="break-all">Huella SHA-256: {c.contentHash}</p>
          </footer>
        </CardContent>
      </Card>

      <ConsentActions patientId={id} consentId={c.id} canRevoke={canWriteClinical(me) && !c.revokedAt} />
    </div>
  );
}
