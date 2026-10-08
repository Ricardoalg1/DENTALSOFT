"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lookupDataicoInvoice } from "./actions";

export function DataicoPanel({ configured, clinicId }: { configured: boolean; clinicId: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Awaited<ReturnType<typeof lookupDataicoInvoice>> | null>(null);
  return <div className="grid gap-4 text-sm">
    <p>Configura la llave en <code>backend/dataico.properties</code> y reinicia el backend.</p>
    <p>Identificador de esta clínica para la configuración: <code className="break-all">{clinicId}</code></p>
    <p className="text-muted-foreground">Consulta una factura existente en Dataico para comprobar la conexión. La consulta no emite documentos ni envía correos.</p>
    <form className="flex flex-wrap gap-2" action={form => {
      const number = String(form.get("number") ?? "").trim();
      start(async () => { setResult(null); setResult(await lookupDataicoInvoice(number)); });
    }}>
      <label className="sr-only" htmlFor="dataico-number">Número completo de factura</label>
      <Input className="max-w-xs" id="dataico-number" name="number" placeholder="Ej. SETP990000001" required maxLength={40} pattern="[A-Za-z0-9-]+" disabled={pending || !configured} />
      <Button disabled={pending || !configured} type="submit">{pending ? "Consultando…" : "Consultar en Dataico"}</Button>
    </form>
    <div aria-live="polite">
      {result && (!result.ok ? <p className="text-destructive">{result.error}</p> : <dl className="grid gap-2 rounded-lg border p-3">
        <div><dt className="font-medium">Factura</dt><dd>{result.invoice.number}</dd></div>
        <div><dt className="font-medium">Estado DIAN informado por Dataico</dt><dd>{result.invoice.dianStatus ?? "No informado"}</dd></div>
        <div><dt className="font-medium">UUID</dt><dd className="break-all">{result.invoice.uuid ?? "No informado"}</dd></div>
        <div><dt className="font-medium">CUFE</dt><dd className="break-all">{result.invoice.cufe ?? "No informado"}</dd></div>
      </dl>)}
    </div>
  </div>;
}
