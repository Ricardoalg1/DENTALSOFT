"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ALERT_CONDITIONS, HABITS, MEDICAL_CONDITIONS, type ClinicalBackground } from "@/lib/types";
import { saveBackground } from "../actions";

type TextField = "allergies" | "medications" | "surgicalHistory" | "familyHistory" | "observations";

export function BackgroundForm({ patientId, background }: { patientId: string; background: ClinicalBackground }) {
  const [state, formAction, pending] = useActionState(saveBackground.bind(null, patientId), undefined);
  // Tras un error, el formulario se vuelve a llenar con lo enviado.
  const sent = state?.values;
  const checked = (name: "conditions" | "habits", value: string) =>
    (sent ? sent[name].split(",") : (background[name] as string[])).includes(value);
  const text = (name: TextField) => sent?.[name] ?? background[name] ?? "";

  return (
    <form action={formAction} className="grid gap-6">
      <FormError message={state?.error} />

      <Card>
        <CardHeader>
          <CardTitle>Antecedentes médicos</CardTitle>
          <CardDescription>Los marcados con * se muestran como alerta en la ficha del paciente.</CardDescription>
        </CardHeader>
        <CardContent>
          <CheckboxGroup name="conditions" options={MEDICAL_CONDITIONS} alerts={ALERT_CONDITIONS} isChecked={checked} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detalle</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Text name="allergies" label="Alergias (medicamentos, látex, alimentos…)" max={500} value={text("allergies")} errors={state?.fieldErrors?.allergies} />
          <Text name="medications" label="Medicamentos que toma actualmente" max={500} value={text("medications")} errors={state?.fieldErrors?.medications} />
          <Text name="surgicalHistory" label="Cirugías y hospitalizaciones" max={500} value={text("surgicalHistory")} errors={state?.fieldErrors?.surgicalHistory} />
          <Text name="familyHistory" label="Antecedentes familiares" max={500} value={text("familyHistory")} errors={state?.fieldErrors?.familyHistory} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hábitos</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <CheckboxGroup name="habits" options={HABITS} isChecked={checked} />
          <Text name="observations" label="Observaciones" max={1000} value={text("observations")} errors={state?.fieldErrors?.observations} />
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar antecedentes"}
        </Button>
        <Link href={`/app/pacientes/${patientId}/historia`} className={buttonVariants({ variant: "outline" })}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}

function CheckboxGroup({
  name,
  options,
  alerts = [],
  isChecked,
}: {
  name: "conditions" | "habits";
  options: Record<string, string>;
  alerts?: string[];
  isChecked: (name: "conditions" | "habits", value: string) => boolean;
}) {
  return (
    <fieldset className="grid gap-2 sm:grid-cols-2">
      {Object.entries(options).map(([value, label]) => (
        <label key={value} className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name={name}
            value={value}
            // key: tras un error se remonta con lo que se había marcado.
            key={String(isChecked(name, value))}
            defaultChecked={isChecked(name, value)}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            {label}
            {alerts.includes(value) && <span className="text-destructive"> *</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function Text({ name, label, max, value, errors }: { name: TextField; label: string; max: number; value: string; errors?: string[] }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Textarea key={value} id={name} name={name} rows={2} maxLength={max} defaultValue={value} aria-invalid={errors ? true : undefined} />
      {errors && <p className="text-sm text-destructive">{errors[0]}</p>}
    </div>
  );
}
