"use client";

import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { register } from "../actions";

export function RegisterForm() {
  const [state, action, pending] = useActionState(register, undefined);
  const v = state?.values;
  const e = state?.fieldErrors;
  return (
    <form action={action} className="grid gap-4">
      <FormError message={state?.error} />
      <FormField name="clinicName" label="Nombre de la clínica" required defaultValue={v?.clinicName} errors={e?.clinicName} />
      <FormField name="nit" label="NIT (opcional)" inputMode="numeric" defaultValue={v?.nit} errors={e?.nit} />
      <FormField name="fullName" label="Tu nombre completo" autoComplete="name" required defaultValue={v?.fullName} errors={e?.fullName} />
      <FormField name="email" label="Correo" type="email" autoComplete="email" required defaultValue={v?.email} errors={e?.email} />
      <FormField
        name="password"
        label="Contraseña"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        errors={e?.password}
      />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Creando cuenta…" : "Crear cuenta"}
      </Button>
    </form>
  );
}
