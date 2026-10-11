"use client";

import { useActionState } from "react";
import { acceptAgreement } from "@/app/app/acuerdo/actions";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";

export function AgreementForm() {
  const [state, action, pending] = useActionState(acceptAgreement, undefined);
  return (
    <form action={action} className="grid gap-3">
      <FormError message={state?.error} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="accept" className="mt-1 size-4" required />
        <span>
          Soy el administrador de la clínica, leí el acuerdo y lo acepto en su nombre. Autorizo el registro de esta aceptación (fecha, dirección IP y versión).
        </span>
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Registrando…" : "Aceptar y continuar"}
      </Button>
    </form>
  );
}
