import Image from "next/image";
import { Clock, Mail, MapPin, Phone, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import type { DocumentBranding } from "@/lib/documents";

/** Membrete del documento: logo, nombre, NIT y los datos de contacto que la clínica haya registrado. Siempre sobre papel blanco. */
export function BrandHeader({ brand }: { brand: DocumentBranding }) {
  const contact = [
    brand.address && { icon: MapPin, text: brand.address },
    brand.phone && { icon: Phone, text: brand.phone },
    brand.email && { icon: Mail, text: brand.email },
  ].filter((c): c is { icon: typeof MapPin; text: string } => !!c);
  return (
    <header className="clinical-paper flex flex-wrap items-center justify-between gap-5 rounded-xl border p-5 print:rounded-none print:border-x-0 print:border-t-0 print:px-0">
      <div className="min-h-12">
        {brand.logoId && (
          <Image src={`/bff/document-assets/${brand.logoId}`} width={150} height={90} unoptimized alt={`Logo de ${brand.name}`} className="max-h-24 w-auto max-w-40 object-contain" />
        )}
      </div>
      <div className="grid min-w-0 justify-items-end gap-0.5 text-right">
        <p className="text-lg font-semibold">{brand.name}</p>
        {brand.nit && <p className="text-xs text-muted-foreground">NIT {brand.nit}</p>}
        {contact.map(({ icon: Icon, text }) => (
          <p key={text} className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {text}
            <Icon className="size-3.5 shrink-0 text-primary" aria-hidden />
          </p>
        ))}
      </div>
    </header>
  );
}

export async function ClinicDocumentHeader() {
  const brand = await api<DocumentBranding>("/api/clinic/document-branding");
  return <BrandHeader brand={brand} />;
}

/** «Paciente: nombre · documento», debajo del membrete. */
export function DocumentPatient({ name, identification, detail }: { name: string; identification?: string; detail?: string }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <UserRound className="size-4 text-primary" aria-hidden />
      <span className="text-muted-foreground">Paciente:</span>
      <span className="font-semibold">{name}</span>
      {identification && <span className="text-muted-foreground tabular-nums">· {identification}</span>}
      {detail && <span className="text-muted-foreground">· {detail}</span>}
    </p>
  );
}

/** Firma al pie: «Realizado por:», la firma adjunta sobre la línea y, debajo, el nombre completo. */
export function ProfessionalSignature({
  name,
  registration,
  signatureId,
  title = "Realizado por:",
}: {
  name: string;
  registration?: string;
  signatureId: string | null;
  title?: string;
}) {
  return (
    <div className="mt-5 max-w-sm break-inside-avoid">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="flex min-h-20 items-end border-b border-foreground/60 pb-1">
        {signatureId && (
          <Image src={`/bff/document-assets/${signatureId}`} alt={`Firma de ${name}`} width={220} height={80} unoptimized className="max-h-24 w-auto max-w-full object-contain" />
        )}
      </div>
      <p className="mt-2 font-medium">{name}</p>
      {registration && <p className="text-xs text-muted-foreground">Registro profesional: {registration}</p>}
    </div>
  );
}

/** Firma de un colaborador de la clínica a partir de su perfil de documentos (nombre, registro y firma). */
export async function UserSignature({ userId, title }: { userId: string; title?: string }) {
  const profile = await api<{ name: string; registration: string; signatureId: string | null }>(
    `/api/users/${encodeURIComponent(userId)}/document-profile`,
  );
  return <ProfessionalSignature name={profile.name} registration={profile.registration} signatureId={profile.signatureId} title={title} />;
}

/**
 * Pie del documento con la fecha y hora en que se generó (hora de Colombia). Marca la página como documento:
 * al imprimir se ocultan el encabezado de la ficha del paciente y demás controles de la pantalla.
 */
export function DocumentFooter({ children }: { children?: React.ReactNode }) {
  const generated = new Intl.DateTimeFormat("es-CO", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date());
  return (
    <footer data-print-document className="grid gap-1 border-t pt-3 text-xs text-muted-foreground break-inside-avoid">
      {children}
      <p className="flex items-center gap-1.5">
        <Clock className="size-3.5" aria-hidden /> Documento generado el {generated}
      </p>
    </footer>
  );
}
