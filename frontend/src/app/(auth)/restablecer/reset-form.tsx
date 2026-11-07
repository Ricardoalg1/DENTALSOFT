"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FormError } from "@/components/form-error";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { confirmReset, inspectReset } from "../actions";

type ResetLink = { token: string; twoFactor: boolean } | "checking" | "invalid";

export function ResetForm() {
  const [link, setLink] = useState<ResetLink>("checking");
  const [state, action, pending] = useActionState(confirmReset, undefined);
  const read = useRef(false);

  // El token llega en el fragmento (#t=…), que nunca se envía al servidor. Se borra de la barra de
  // direcciones apenas se lee para que no quede en el historial ni se comparta por error.
  useEffect(() => {
    if (read.current) return;
    read.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get("t");
    window.history.replaceState(null, "", window.location.pathname);
    const check = token ? inspectReset(token) : Promise.resolve({ valid: false, twoFactorRequired: false });
    void check.then((r) => setLink(token && r.valid ? { token, twoFactor: r.twoFactorRequired } : "invalid"));
  }, []);

  if (link === "checking") return <p role="status" className="text-sm text-muted-foreground">Revisando el enlace…</p>;
  if (link === "invalid") {
    return (
      <p role="alert" className="text-sm">
        Este enlace no es válido o ya venció.{" "}
        <a href="/recuperar" className="font-medium text-primary hover:underline">Solicita uno nuevo</a>.
      </p>
    );
  }
  const e = state?.fieldErrors;
  return (
    <form action={action} className="grid gap-4">
      <FormError message={state?.error} />
      <input type="hidden" name="token" value={link.token} />
      <FormField name="newPassword" label="Contraseña nueva" type="password" autoComplete="new-password" minLength={10} maxLength={72} required autoFocus errors={e?.newPassword} />
      <FormField name="confirm" label="Repite la contraseña nueva" type="password" autoComplete="new-password" minLength={10} maxLength={72} required errors={e?.confirm} />
      <p className="text-xs text-muted-foreground">Usa al menos 10 caracteres. Una frase de varias palabras es fácil de recordar y difícil de adivinar.</p>
      {link.twoFactor && (
        <FormField name="code" label="Código de tu app autenticadora o de respaldo" autoComplete="one-time-code" spellCheck={false} maxLength={19} required errors={e?.code} />
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Guardando…" : "Guardar contraseña"}
      </Button>
    </form>
  );
}
