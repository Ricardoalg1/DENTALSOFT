"use client";

import { useActionState, useState } from "react";
import { FormError } from "@/components/form-error";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { verifyLogin } from "../../actions";

export function VerifyForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(verifyLogin, undefined);
  const [recovery, setRecovery] = useState(false);
  return (
    <form action={action} className="grid gap-4">
      <FormError message={state?.error} />
      <input type="hidden" name="next" value={next ?? ""} />
      {recovery ? (
        <FormField key="recovery" name="code" label="Código de respaldo" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={19} placeholder="ABCD-EFGH-JKLM-NPQR" required autoFocus errors={state?.fieldErrors?.code} />
      ) : (
        <FormField key="totp" name="code" label="Código de 6 dígitos" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus errors={state?.fieldErrors?.code} />
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Verificando…" : "Verificar"}
      </Button>
      <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => setRecovery((v) => !v)}>
        {recovery ? "Usar el código de la app" : "No tengo mi teléfono: usar un código de respaldo"}
      </button>
    </form>
  );
}
