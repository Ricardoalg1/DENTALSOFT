"use client";

import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ROLE_LABELS, type Role } from "@/lib/types";
import { createUser } from "./actions";

export function CreateUserForm() {
  const [state, action, pending] = useActionState(createUser, undefined);
  const v = state?.values;
  const e = state?.fieldErrors;
  return (
    <form action={action} className="grid gap-4">
      <FormError message={state?.error} />
      {state?.ok && <p className="text-sm text-primary">Usuario creado.</p>}
      <FormField name="fullName" label="Nombre completo" required defaultValue={v?.fullName} errors={e?.fullName} />
      <FormField name="email" label="Correo" type="email" required defaultValue={v?.email} errors={e?.email} />
      <div className="grid gap-1.5">
        <Label htmlFor="role">Rol</Label>
        <select
          id="role"
          name="role"
          required
          defaultValue={v?.role ?? "DENTIST"}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        {e?.role && <p className="text-sm text-destructive">{e.role[0]}</p>}
      </div>
      <FormField
        name="password"
        label="Contraseña inicial"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        errors={e?.password}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Creando…" : "Agregar usuario"}
      </Button>
    </form>
  );
}
