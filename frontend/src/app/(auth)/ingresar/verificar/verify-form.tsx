"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { CodeInput } from "@/components/booking/code-input";
import { FormError } from "@/components/form-error";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { verifyLogin } from "../../actions";
import { AuthenticatorHint } from "./authenticator-hint";

export function VerifyForm({ next }: { next?: string }) {
  // Cada intento rechazado limpia las casillas para escribir el código de nuevo.
  const [attempt, setAttempt] = useState(0);
  const [state, action, pending] = useActionState(async (previous: Parameters<typeof verifyLogin>[0], formData: FormData) => {
    const result = await verifyLogin(previous, formData);
    setAttempt((n) => n + 1);
    return result;
  }, undefined);
  const [recovery, setRecovery] = useState(false);
  const boxesRef = useRef<HTMLDivElement>(null);

  // Las casillas están deshabilitadas mientras se verifica: al terminar, el cursor vuelve a la primera.
  useEffect(() => {
    if (!pending) boxesRef.current?.querySelector("input")?.focus();
  }, [pending]);

  /** El código de la app se envía solo al completar el último dígito. */
  function onCodeChange(code: string) {
    if (code.length !== 6 || pending) return;
    const formData = new FormData();
    formData.set("code", code);
    formData.set("next", next ?? "");
    startTransition(() => action(formData));
  }

  return (
    <form action={action} className="grid gap-4">
      <FormError message={state?.error} />
      <input type="hidden" name="next" value={next ?? ""} />
      {recovery ? (
        <>
          <FormField key="recovery" name="code" label="Código de respaldo" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={19} placeholder="ABCD-EFGH-JKLM-NPQR" required autoFocus errors={state?.fieldErrors?.code} />
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Verificando…" : "Verificar"}
          </Button>
        </>
      ) : (
        <>
          <AuthenticatorHint />
          <div key={attempt} ref={boxesRef} className={state?.error ? "code-input-rejected" : undefined}>
            <CodeInput onChange={onCodeChange} disabled={pending} />
          </div>
          <p role="status" className="flex min-h-5 items-center justify-center gap-1.5 text-sm text-muted-foreground">
            {pending ? (
              <>
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Verificando…
              </>
            ) : (
              "Al escribir el último dígito ingresas automáticamente."
            )}
          </p>
        </>
      )}
      <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => setRecovery((v) => !v)}>
        {recovery ? "Usar el código de la app" : "No tengo mi teléfono: usar un código de respaldo"}
      </button>
    </form>
  );
}
