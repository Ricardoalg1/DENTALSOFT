"use client";

import { useEffect, useState } from "react";
import { getWompiSetup, removeCard, saveCard } from "@/app/app/cuenta/billing-actions";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WompiSetup } from "@/lib/platform";

type Props = { current: { label: string } | null };

/**
 * Guardar una tarjeta para la renovación automática. La tarjeta se envía DIRECTAMENTE del navegador a
 * Wompi (que devuelve un token); a Occlus solo llega ese token. Los números no se guardan en ningún
 * estado más allá de este formulario y se borran al terminar.
 */
export function CardForm({ current }: Props) {
  const [setup, setSetup] = useState<WompiSetup>();
  const [open, setOpen] = useState(false);
  const [terms, setTerms] = useState(false);
  const [data, setData] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open || setup) return;
    getWompiSetup().then((r) => (r.error ? setError(r.error) : setSetup(r.data)));
  }, [open, setup]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!setup) return;
    const form = e.currentTarget;
    const f = new FormData(form);
    const [month, yearRaw] = String(f.get("expiry") ?? "").split("/").map((x) => x.trim());
    const year = yearRaw?.slice(-2);
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch(`${setup.apiBase}/tokens/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${setup.publicKey}` },
        body: JSON.stringify({
          number: String(f.get("number") ?? "").replace(/\s|-/g, ""),
          cvc: String(f.get("cvc") ?? ""),
          exp_month: month?.padStart(2, "0"),
          exp_year: year,
          card_holder: String(f.get("holder") ?? "").trim(),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data?.id) {
        setError("La tarjeta no fue aceptada. Revisa los datos e inténtalo de nuevo.");
        return;
      }
      const brand = String(json.data.brand ?? "Tarjeta").toLowerCase().replace(/^./, (c: string) => c.toUpperCase());
      const out = await saveCard({
        cardToken: json.data.id,
        acceptanceToken: setup.acceptanceToken,
        personalAuthToken: setup.personalAuthToken,
        label: `${brand} ···· ${String(json.data.last_four ?? "").replace(/\D/g, "")}`,
      });
      if (out.error) {
        setError(out.error);
        return;
      }
      form.reset(); // borra el número, el vencimiento y el CVC
      setDone(true);
      setOpen(false);
    } catch {
      setError("No pudimos conectar con Wompi. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      {current ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            Renovación automática con <strong>{current.label}</strong>.
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
              Cambiar tarjeta
            </Button>
            <form action={removeCard}>
              <Button type="submit" variant="ghost" size="sm">
                Quitar
              </Button>
            </form>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">Guarda una tarjeta y tu suscripción se renueva sola.</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
            Guardar tarjeta
          </Button>
        </div>
      )}
      {done && (
        <p role="status" className="text-sm text-primary">
          Tarjeta guardada.
        </p>
      )}
      <FormError message={error} />
      {open && (
        <form onSubmit={submit} className="grid gap-3 rounded-lg border p-4" autoComplete="on">
          <div className="grid gap-1.5">
            <Label htmlFor="card-holder">Nombre en la tarjeta</Label>
            <Input id="card-holder" name="holder" autoComplete="cc-name" required minLength={5} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="card-number">Número de tarjeta</Label>
            <Input id="card-number" name="number" inputMode="numeric" autoComplete="cc-number" required pattern="[0-9 \-]{13,23}" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="card-expiry">Vence (MM/AA)</Label>
              <Input id="card-expiry" name="expiry" inputMode="numeric" autoComplete="cc-exp" placeholder="08/29" required pattern="[0-9]{1,2} ?/ ?[0-9]{2,4}" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="card-cvc">CVC</Label>
              <Input id="card-cvc" name="cvc" inputMode="numeric" autoComplete="cc-csc" required pattern="[0-9]{3,4}" />
            </div>
          </div>
          {setup && (
            <div className="grid gap-2 text-sm">
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 size-4" required />
                <span>
                  Acepto los{" "}
                  <a href={setup.acceptancePermalink} target="_blank" rel="noreferrer" className="text-primary underline">
                    términos y condiciones de Wompi
                  </a>
                  .
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={data} onChange={(e) => setData(e.target.checked)} className="mt-0.5 size-4" required />
                <span>
                  Autorizo el{" "}
                  <a href={setup.personalAuthPermalink} target="_blank" rel="noreferrer" className="text-primary underline">
                    tratamiento de mis datos personales
                  </a>{" "}
                  por parte de Wompi.
                </span>
              </label>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Los datos de tu tarjeta van directo a Wompi. Occlus solo recibe un código que le permite cobrar tu suscripción; nunca ve ni guarda el número.
          </p>
          <Button type="submit" disabled={busy || !setup || !terms || !data}>
            {busy ? "Guardando…" : "Guardar tarjeta"}
          </Button>
        </form>
      )}
    </div>
  );
}
