"use client";

import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { requestReset } from "../actions";

export function RecoverForm() {
  const [state, action, pending] = useActionState(requestReset, undefined);
  if (state?.ok) {
    // El mismo mensaje exista o no la cuenta: esta pantalla no revela quién está registrado.
    return (
      <p role="status" className="text-sm">
        Si ese correo tiene una cuenta activa, recibirás un enlace en unos minutos. Vence en 30 minutos. Revisa también la carpeta de spam.
      </p>
    );
  }
  return (
    <form action={action} className="grid gap-4">
      <FormError message={state?.error} />
      <FormField name="email" label="Correo" type="email" autoComplete="email" required defaultValue={state?.values?.email} errors={state?.fieldErrors?.email} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Enviando…" : "Enviar enlace"}
      </Button>
    </form>
  );
}
