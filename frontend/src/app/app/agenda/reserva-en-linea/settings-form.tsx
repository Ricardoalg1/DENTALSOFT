"use client";

import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { BookingSettings } from "@/lib/booking";
import { saveBookingSettings } from "./actions";

const VISIT_TYPES = [
  ["FIRST_VISIT", "Primera vez"],
  ["CONTROL", "Control"],
  ["TREATMENT", "Tratamiento"],
  ["PREVENTION", "Promoción y prevención (P&P)"],
];

export function SettingsForm({ settings: s, professionals }: { settings: BookingSettings; professionals: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(saveBookingSettings, undefined);
  const e = state?.fieldErrors;
  return (
    <Card>
      <CardContent className="pt-6">
        <form action={action} className="grid gap-5">
          <FormError message={state?.error} />
          {state?.ok && <p role="status" className="text-sm text-primary">Cambios guardados.</p>}
          {s.enabled && <p className="text-sm">Tu página: <a className="font-medium text-primary hover:underline" href={s.publicUrl} target="_blank" rel="noreferrer">{s.publicUrl}</a></p>}
          {(!s.mailReady || !s.captchaReady) && (
            <p role="status" className="text-sm text-destructive">
              {!s.mailReady && "Falta configurar el envío de correos en el servidor. "}
              {!s.captchaReady && "Falta configurar el captcha en el servidor. "}
              La página no recibirá reservas hasta entonces.
            </p>
          )}
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="enabled" defaultChecked={s.enabled} />
            Recibir reservas en línea
          </label>
          <FormField name="slug" label="Dirección de tu página (lo que va después de /reservar/)" defaultValue={s.slug} minLength={3} maxLength={60} required errors={e?.slug} />
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Tipos de cita que se pueden reservar</legend>
            {VISIT_TYPES.map(([code, label]) => (
              <label key={code} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="visitTypes" value={code} defaultChecked={s.visitTypes.includes(code)} />
                {label}
              </label>
            ))}
          </fieldset>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Profesionales disponibles</legend>
            <p className="text-xs text-muted-foreground">Cada uno debe tener su horario de atención configurado.</p>
            {professionals.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="dentistIds" value={p.id} defaultChecked={s.dentistIds.includes(p.id)} />
                {p.name}
              </label>
            ))}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField name="durationMinutes" label="Duración (minutos)" type="number" min={10} max={240} defaultValue={s.durationMinutes} required errors={e?.durationMinutes} />
            <FormField name="minNoticeHours" label="Anticipación mínima (horas)" type="number" min={0} max={720} defaultValue={s.minNoticeHours} required errors={e?.minNoticeHours} />
            <FormField name="maxDaysAhead" label="Hasta cuántos días adelante" type="number" min={1} max={90} defaultValue={s.maxDaysAhead} required errors={e?.maxDaysAhead} />
          </div>
          <Button type="submit" size="lg" className="w-fit" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
