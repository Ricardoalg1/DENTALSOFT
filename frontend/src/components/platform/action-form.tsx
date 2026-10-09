"use client";

import { useRef, useState, useTransition } from "react";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import type { PlatformState } from "@/lib/platform";

type Props = {
  action: (prev: PlatformState, formData: FormData) => Promise<PlatformState>;
  submit: string;
  pendingLabel?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  /** Pregunta de confirmación antes de enviar (acciones difíciles de revertir). */
  confirm?: string;
  successMessage?: string;
  /** Vacía los campos al terminar bien. Desactívalo si hay campos controlados (p. ej. el selector de módulos). */
  resetOnSuccess?: boolean;
  onResult?: (state: NonNullable<PlatformState>) => void;
  className?: string;
  children: React.ReactNode;
};

/**
 * Formulario que llama a una Server Action sin reiniciar los campos cuando hay un error (el reinicio
 * automático de React 19 borraría lo que la persona escribió).
 */
export function ActionForm({
  action,
  submit,
  pendingLabel = "Guardando…",
  variant,
  confirm,
  successMessage = "Guardado.",
  resetOnSuccess = true,
  onResult,
  className,
  children,
}: Props) {
  const [state, setState] = useState<PlatformState>();
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      className={className ?? "grid gap-3"}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const data = new FormData(e.currentTarget);
        start(async () => {
          const result = await action(undefined, data);
          setState(result);
          if (result?.ok && resetOnSuccess) ref.current?.reset();
          if (result) onResult?.(result);
        });
      }}
    >
      <FormError message={state?.error} />
      {state?.ok && (
        <p role="status" className="text-sm text-primary">
          {state.message ?? successMessage}
        </p>
      )}
      <ActionFormErrors errors={state?.fieldErrors} />
      {children}
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? pendingLabel : submit}
      </Button>
    </form>
  );
}

/** Errores de validación por campo, juntos (los campos son libres, así que no se pintan uno a uno). */
function ActionFormErrors({ errors }: { errors?: Record<string, string[] | undefined> }) {
  const list = Object.entries(errors ?? {}).filter(([, v]) => v?.length);
  if (!list.length) return null;
  return (
    <ul role="alert" className="grid gap-0.5 text-sm text-destructive">
      {list.map(([k, v]) => (
        <li key={k}>{v?.[0]}</li>
      ))}
    </ul>
  );
}
