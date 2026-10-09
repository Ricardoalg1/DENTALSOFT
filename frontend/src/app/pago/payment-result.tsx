"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { refreshCheckout } from "@/app/app/cuenta/billing-actions";
import { buttonVariants } from "@/components/ui/button";
import type { CheckoutResult } from "@/lib/platform";

const POLL_MS = 4000;
const MAX_TRIES = 30; // ~2 minutos

/** Pregunta el resultado y sigue preguntando mientras la pasarela no decida. */
export function PaymentResult({ checkoutId, providerRef }: { checkoutId: string; providerRef?: string }) {
  const [result, setResult] = useState<CheckoutResult>();
  const [error, setError] = useState<string>();
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (result && result.status !== "CREATED") return;
    if (tries >= MAX_TRIES) return;
    let cancelled = false;
    const timer = setTimeout(
      async () => {
        const out = await refreshCheckout(checkoutId, providerRef);
        if (cancelled) return;
        if (out.error) setError(out.error);
        else {
          setError(undefined);
          setResult(out.data);
        }
        setTries((t) => t + 1);
      },
      tries === 0 ? 0 : POLL_MS,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [checkoutId, providerRef, result, tries]);

  const waiting = !result || result.status === "CREATED";
  return (
    <div className="grid gap-4" aria-live="polite">
      {result?.status === "APPROVED" && (
        <>
          <h1 className="text-xl font-semibold tracking-tight">¡Pago recibido!</h1>
          <p className="text-sm text-muted-foreground">{result.message}</p>
          <Link href="/app" className={buttonVariants()}>
            Ir a mi panel
          </Link>
        </>
      )}
      {result?.status === "DECLINED" && (
        <>
          <h1 className="text-xl font-semibold tracking-tight">El pago no se completó</h1>
          <p className="text-sm text-muted-foreground">{result.message}</p>
          <Link href="/app" className={buttonVariants({ variant: "outline" })}>
            Volver e intentar de nuevo
          </Link>
        </>
      )}
      {waiting && tries < MAX_TRIES && (
        <>
          <h1 className="text-xl font-semibold tracking-tight">Confirmando tu pago…</h1>
          <p className="text-sm text-muted-foreground">{result?.message ?? "Estamos consultando a la pasarela. No cierres esta página."}</p>
        </>
      )}
      {waiting && tries >= MAX_TRIES && (
        <>
          <h1 className="text-xl font-semibold tracking-tight">Aún no tenemos la confirmación</h1>
          <p className="text-sm text-muted-foreground">
            Si ya pagaste, tu suscripción se actualizará sola cuando la pasarela nos confirme. Puedes cerrar esta página.
          </p>
          <Link href="/app" className={buttonVariants({ variant: "outline" })}>
            Ir a mi panel
          </Link>
        </>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
