"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form-error";
import type { Issuer } from "@/lib/billing";
import { saveBillingProfile } from "./actions";

export function BillingProfileForm({ profile }: { profile: Issuer | null }) {
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <form onSubmit={e => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      const value = (name: string) => String(form.get(name) ?? "").trim();
      setError(undefined); setSaved(false);
      startTransition(async () => {
        const result = await saveBillingProfile({ legalName: value("legalName"), nit: value("nit"), providerCode: value("providerCode"), address: value("address"), municipality: value("municipality"), email: value("email") });
        if (result.ok) setSaved(true); else setError(result.error);
      });
    }} className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field name="legalName" label="Razón social" value={profile?.legalName} maxLength={150} />
        <Field name="nit" label="NIT (sin dígito de verificación)" value={profile?.nit} pattern="[0-9]{5,15}" maxLength={15} />
        <Field name="providerCode" label="Código REPS del prestador (12 dígitos)" value={profile?.providerCode} pattern="[0-9]{12}" maxLength={12} />
        <Field name="municipality" label="Municipio DIVIPOLA (5 dígitos)" value={profile?.municipality} pattern="[0-9]{5}" maxLength={5} />
        <Field name="address" label="Dirección fiscal" value={profile?.address} maxLength={200} />
        <Field name="email" label="Correo de facturación" value={profile?.email} type="email" maxLength={160} />
      </div>
      <p className="text-xs text-muted-foreground">Los documentos preparados conservan sus datos. Después de cambiar este perfil, vuelve a guardar los datos del paciente en los borradores abiertos.</p>
      <FormError message={error} />
      {saved && <p role="status" className="text-sm text-primary">Datos guardados.</p>}
      <Button disabled={pending} className="w-fit">Guardar datos fiscales</Button>
    </form>
  );
}

function Field({ name, label, value, ...props }: { name: string; label: string; value?: string } & Omit<React.ComponentProps<typeof Input>, "name" | "value">) {
  return <div className="grid gap-1.5"><Label htmlFor={`billing-${name}`}>{label}</Label><Input id={`billing-${name}`} name={name} required defaultValue={value ?? ""} {...props} /></div>;
}
