"use client";

import { useState } from "react";
import { startCheckout } from "@/app/app/cuenta/billing-actions";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { PROVIDER_LABELS } from "@/lib/platform";

const EPAYCO_SCRIPT = "https://checkout.epayco.co/checkout.js";

type EpaycoHandler = { open: (data: Record<string, string>) => void };
declare global {
  interface Window {
    ePayco?: { checkout: { configure: (o: { key: string; test: boolean }) => EpaycoHandler } };
  }
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`) && window.ePayco) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("script"));
    document.head.appendChild(s);
  });
}

/**
 * Botones «Pagar con…». Wompi: redirige a su página de pago. ePayco: abre su checkout. La tarjeta se
 * escribe en la página de la pasarela; Occlus nunca recibe datos de tarjeta.
 */
export function PayButtons({ providers, label = "Pagar" }: { providers: string[]; label?: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  async function pay(provider: string) {
    setError(undefined);
    setBusy(provider);
    const out = await startCheckout(provider);
    if (out.error !== undefined) {
      setError(out.error);
      setBusy(null);
      return;
    }
    const { redirectUrl, params } = out.data;
    if (redirectUrl) {
      window.location.assign(redirectUrl);
      return; // la página cambia; el botón queda ocupado
    }
    try {
      await loadScript(EPAYCO_SCRIPT);
      const { key, test, ...data } = params;
      window.ePayco!.checkout.configure({ key, test: test === "true" }).open(data);
    } catch {
      setError("No pudimos abrir la página de pago. Revisa tu conexión e inténtalo de nuevo.");
    }
    setBusy(null);
  }

  return (
    <div className="grid gap-2">
      <FormError message={error} />
      <div className="flex flex-wrap gap-2">
        {providers.map((p) => (
          <Button key={p} type="button" onClick={() => pay(p)} disabled={busy !== null}>
            {busy === p ? "Abriendo…" : `${label} con ${PROVIDER_LABELS[p] ?? p}`}
          </Button>
        ))}
      </div>
    </div>
  );
}
