"use client";
import { UserRoundPlus } from "lucide-react";

import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/native-select";
import { ROLE_LABELS } from "@/lib/types";
import { createUser } from "./actions";

export function CreateUserForm() {
  const [state, action, pending] = useActionState(createUser, undefined);
  const v = state?.values;
  const e = state?.fieldErrors;
  return (
    <form action={action} className="grid gap-4">
      <FormError message={state?.error} />
      {state?.ok && <p className="text-sm text-primary">Usuario creado.</p>}
      <FormField name="fullName" placeholder="Ej. Ana María López" label="Nombre completo" required defaultValue={v?.fullName} errors={e?.fullName} />
      <FormField name="email" placeholder="Ej. correo@clinica.com" label="Correo" type="email" required defaultValue={v?.email} errors={e?.email} />
      <NativeSelect
        name="role"
        label="Rol"
        required
        options={ROLE_LABELS}
        defaultValue={v?.role ?? "DENTIST"}
        errors={e?.role}
      />
      <FormField
        name="password"
        placeholder="Mínimo 8 caracteres"
        label="Contraseña inicial"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        errors={e?.password}
      />
      <Button type="submit" disabled={pending}>
        <UserRoundPlus aria-hidden="true" />{pending ? "Creando…" : "Agregar usuario"}
      </Button>
    </form>
  );
}
