"use client";

import { useActionState } from "react";
import { changePassword } from "@/app/app/cuenta/actions";
import { FormError } from "@/components/form-error";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";

export function ChangePasswordForm({ forced = false }: { forced?: boolean }) {
  const [state, action, pending] = useActionState(changePassword, undefined);
  const e = state?.fieldErrors;
  return (
    <form action={action} className="grid gap-4">
      <FormError message={state?.error} />
      <FormField
        name="currentPassword"
        label={forced ? "Contraseña temporal" : "Contraseña actual"}
        type="password"
        autoComplete="current-password"
        required
        errors={e?.currentPassword}
      />
      <FormField
        name="newPassword"
        label="Contraseña nueva"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        errors={e?.newPassword}
      />
      <FormField
        name="confirm"
        label="Repite la contraseña nueva"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        errors={e?.confirm}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : forced ? "Guardar y continuar" : "Cambiar contraseña"}
      </Button>
    </form>
  );
}
