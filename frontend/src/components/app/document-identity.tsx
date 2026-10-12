import Image from "next/image";
import { api } from "@/lib/api";
import type { DocumentBranding } from "@/lib/documents";
/** Membrete del documento: logo, nombre, NIT y los datos de contacto que la clínica haya registrado. Siempre sobre papel blanco. */
export function BrandHeader({ brand }: { brand: DocumentBranding }) {
  const contact = [brand.phone, brand.email].filter(Boolean).join(" · ");
  return (
    <header className="clinical-paper flex flex-wrap items-center justify-between gap-5 rounded-xl border p-5 print:rounded-none print:border-x-0 print:border-t-0 print:px-0">
      <div className="min-h-12">
        {brand.logoId && (
          <Image src={`/bff/document-assets/${brand.logoId}`} width={150} height={90} unoptimized alt={`Logo de ${brand.name}`} className="max-h-24 w-auto max-w-40 object-contain" />
        )}
      </div>
      <div className="min-w-0 text-right">
        <p className="text-lg font-semibold">{brand.name}</p>
        {brand.nit && <p className="text-xs text-muted-foreground">NIT {brand.nit}</p>}
        {brand.address && <p className="mt-1 text-sm text-muted-foreground">{brand.address}</p>}
        {contact && <p className="text-sm text-muted-foreground">{contact}</p>}
      </div>
    </header>
  );
}
export async function ClinicDocumentHeader() { const brand = await api<DocumentBranding>("/api/clinic/document-branding");return <BrandHeader brand={brand} />; }
export function ProfessionalSignature({ name, registration, signatureId }: { name: string; registration: string; signatureId: string | null }) {return <div className="mt-5 max-w-sm"><div className="flex min-h-20 items-end border-b border-primary/30 pb-2">{signatureId && <Image src={`/bff/document-assets/${signatureId}`} alt={`Firma de ${name}`} width={220} height={80} unoptimized className="max-h-24 w-auto max-w-full object-contain" />}</div><p className="mt-2 font-medium">{name}</p>{registration && <p className="text-xs text-muted-foreground">Registro profesional: {registration}</p>}<p className="text-xs text-muted-foreground">Firma del profesional</p></div>;}
