import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { BrandHeader, ProfessionalSignature } from "@/components/app/document-identity";
import { PrintButton } from "@/components/app/print-button";
import { RichText } from "@/components/rich-text";
import { api, ApiError } from "@/lib/api";
import { ISSUED_KINDS, type IssuedDocument } from "@/lib/documents";
import { formatDate, formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Documento" };

export default async function IssuedDocumentPage({ params }: PageProps<"/app/pacientes/[id]/documentos/[docId]">) {
  const { id, docId } = await params;
  let doc: IssuedDocument;
  try {
    doc = await api<IssuedDocument>(`/api/issued-documents/${encodeURIComponent(docId)}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
  if (doc.patientId !== id) notFound();
  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link href={`/app/pacientes/${id}/documentos`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Documentos
        </Link>
        <PrintButton label="Imprimir / Guardar PDF" />
      </div>
      {!doc.integrityOk && (
        <p role="alert" className="no-print flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <ShieldAlert className="size-4" aria-hidden /> Este documento no supera la comprobación de integridad.
        </p>
      )}
      <BrandHeader brand={doc.clinic} />
      <article className="clinical-paper grid gap-5 rounded-xl border p-6 sm:p-10 print:border-0 print:p-0">
        <header className="grid gap-1 border-b pb-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{ISSUED_KINDS[doc.kind].label}</p>
          <h1 className="text-xl font-semibold">{doc.title}</h1>
          <p className="text-sm text-muted-foreground">
            {doc.patient} · {doc.identification} · nacimiento {formatDate(doc.birthDate)}
          </p>
          <p className="text-sm text-muted-foreground">Emitido el {formatDateTime(doc.issuedAt)}</p>
        </header>
        <RichText className="text-sm leading-7">{doc.body}</RichText>
        <ProfessionalSignature name={doc.professional} registration={doc.registration} signatureId={doc.signatureId} />
        <p className="border-t pt-3 font-mono text-[0.65rem] text-muted-foreground break-all">Huella de integridad: {doc.hash}</p>
      </article>
    </div>
  );
}
