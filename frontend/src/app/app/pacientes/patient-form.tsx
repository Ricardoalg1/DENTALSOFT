"use client";

import Link from "next/link";
import { toast } from "sonner";
import { useEffect } from "react";
import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { FormField } from "@/components/form-field";
import { NativeSelect } from "@/components/native-select";
import { Button, buttonVariants } from "@/components/ui/button";
import { FileText, Fingerprint, UserRound, MapPin, HeartPulse, UsersRound, NotebookPen, MessageCircle, Save, LoaderCircle, X, ShieldCheck } from "lucide-react";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/lib/forms";
import {
  DOCUMENT_TYPES,
  REGIMES,
  SEXES,
  ZONES,
  type Patient,
} from "@/lib/types";

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  patient?: Patient;
  cancelHref: string;
};

/** Formulario compartido para crear y editar. Tras un error, los valores enviados tienen prioridad. */
export function PatientForm({ action, patient, cancelHref }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const e = state?.fieldErrors;
  useEffect(() => {
    if (state?.fieldErrors)
      toast.error("Revisa los campos señalados antes de guardar");
  }, [state]);
  const v = (name: keyof Patient) =>
    state?.values?.[name] ??
    (patient?.[name] as string | null | undefined) ??
    "";

  return (
    <form action={formAction} className="patient-document grid gap-0 overflow-hidden rounded-xl border bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-primary/15 bg-primary/5 px-6 py-7 sm:px-10">
        <div className="flex items-center gap-4">
          <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileText className="size-6" aria-hidden="true" /></span>
          <div><p className="text-xs font-semibold uppercase tracking-widest text-primary">Registro de pacientes</p><h2 className="mt-1 text-xl font-semibold">{patient ? "Ficha del paciente" : "Ficha de ingreso"}</h2></div>
        </div>
        <span className="rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">{patient ? "Actualización" : "Nuevo registro"}</span>
        <p className="w-full text-sm text-muted-foreground">Completa los datos de identificación, contacto y afiliación. Los campos con * son obligatorios.</p>
      </header>
      <div className="px-6 sm:px-10"><FormError message={state?.error} /></div>

      <Section title="Identificación">
        <NativeSelect
          name="documentType"
          label="Tipo de documento"
          required
          options={DOCUMENT_TYPES}
          defaultValue={v("documentType") || "CC"}
          errors={e?.documentType}
        />
        <FormField
          name="documentNumber"
          label="Número de documento"
          required
          defaultValue={v("documentNumber")}
          errors={e?.documentNumber}
        />
      </Section>

      <Section title="Datos personales">
        <FormField
          name="firstName"
          label="Primer nombre"
          required
          defaultValue={v("firstName")}
          errors={e?.firstName}
        />
        <FormField
          name="middleName"
          label="Segundo nombre"
          defaultValue={v("middleName")}
          errors={e?.middleName}
        />
        <FormField
          name="firstLastName"
          label="Primer apellido"
          required
          defaultValue={v("firstLastName")}
          errors={e?.firstLastName}
        />
        <FormField
          name="secondLastName"
          label="Segundo apellido"
          defaultValue={v("secondLastName")}
          errors={e?.secondLastName}
        />
        <FormField
          name="birthDate"
          label="Fecha de nacimiento"
          type="date"
          required
          defaultValue={v("birthDate")}
          errors={e?.birthDate}
        />
        <NativeSelect
          name="sex"
          label="Sexo"
          required
          options={SEXES}
          placeholder="Selecciona…"
          defaultValue={v("sex")}
          errors={e?.sex}
        />
        <FormField
          name="occupation"
          label="Ocupación"
          defaultValue={v("occupation")}
          errors={e?.occupation}
        />
      </Section>

      <Section title="Contacto y residencia">
        <FormField
          name="phone"
          label="Teléfono"
          type="tel"
          defaultValue={v("phone")}
          errors={e?.phone}
        />
        <FormField
          name="email"
          label="Correo"
          type="email"
          defaultValue={v("email")}
          errors={e?.email}
        />
        <FormField
          name="address"
          label="Dirección"
          defaultValue={v("address")}
          errors={e?.address}
        />
        <FormField
          name="municipality"
          label="Municipio"
          defaultValue={v("municipality")}
          errors={e?.municipality}
        />
        <NativeSelect
          name="residenceZone"
          label="Zona"
          options={ZONES}
          placeholder="Sin especificar"
          defaultValue={v("residenceZone")}
          errors={e?.residenceZone}
        />
      </Section>

      <Section title="Afiliación en salud">
        <NativeSelect
          name="regime"
          label="Régimen"
          required
          options={REGIMES}
          placeholder="Selecciona…"
          defaultValue={v("regime")}
          errors={e?.regime}
        />
        <FormField
          name="insurer"
          label="Aseguradora (EPS)"
          defaultValue={v("insurer")}
          errors={e?.insurer}
        />
      </Section>

      <Section
        title="Acudiente"
        description="Obligatorio para menores de edad."
      >
        <FormField
          name="guardianName"
          label="Nombre del acudiente"
          defaultValue={v("guardianName")}
          errors={e?.guardianName}
        />
        <FormField
          name="guardianPhone"
          label="Teléfono del acudiente"
          type="tel"
          defaultValue={v("guardianPhone")}
          errors={e?.guardianPhone}
        />
        <FormField
          name="guardianRelationship"
          label="Parentesco"
          defaultValue={v("guardianRelationship")}
          errors={e?.guardianRelationship}
        />
      </Section>

      <Section title="Notas">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="notes">Observaciones administrativas</Label>
          <textarea
            key={v("notes")}
            id="notes"
            name="notes"
            rows={3}
            maxLength={1000}
            defaultValue={v("notes")}
            className="min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
        </div>
        {patient && (
          <label className="flex items-center gap-2 text-sm">
            <input type="hidden" name="activePresent" value="1" />
            <input
              type="checkbox"
              name="active"
              defaultChecked={
                state?.values ? state.values.active === "on" : patient.active
              }
              className="size-4 accent-primary"
            />
            Paciente activo
          </label>
        )}
      </Section>

      <Section
        title="Recordatorios por WhatsApp"
        description="Marca la opción únicamente si el paciente autorizó el uso de su teléfono para recordatorios y conserva el soporte de esa autorización."
      >
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            name="whatsappConsent"
            defaultChecked={
              state?.values
                ? state.values.whatsappConsent === "on"
                : (patient?.whatsappConsent ?? false)
            }
            className="size-4 accent-primary"
          />
          El paciente autorizó recibir recordatorios por WhatsApp
        </label>
        <p className="text-xs text-muted-foreground sm:col-span-2">
          Se admite un celular colombiano con o sin +57. Desmarca para retirar
          la autorización; el paciente también puede responder BAJA.
        </p>
      </Section>

      <div className="flex flex-wrap items-center gap-3 border-t bg-muted/30 px-6 py-6 sm:px-10">
        <p className="flex w-full items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 shrink-0" aria-hidden="true" />Revisa la información antes de guardar la ficha.</p>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
          {pending
            ? "Guardando…"
            : patient
              ? "Guardar cambios"
              : "Crear paciente"}
        </Button>
        <Link
          href={cancelHref}
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          <X className="size-4" aria-hidden="true" /> Cancelar
        </Link>
      </div>
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const sections = [
    { title: "Identificación", icon: Fingerprint },
    { title: "Datos personales", icon: UserRound },
    { title: "Contacto y residencia", icon: MapPin },
    { title: "Afiliación en salud", icon: HeartPulse },
    { title: "Acudiente", icon: UsersRound },
    { title: "Notas", icon: NotebookPen },
    { title: "Recordatorios por WhatsApp", icon: MessageCircle },
  ];
  const index = sections.findIndex(section => section.title === title);
  const Icon = sections[index]?.icon ?? FileText;
  return (
    <fieldset className="patient-document-section min-w-0 border-b border-border/70 px-6 py-6 last:border-0 sm:px-10" style={{ animationDelay: `${Math.max(0, index) * 45}ms` }}>
      <legend className="sr-only">{title}</legend>
      <div className="mb-5 flex items-start gap-3">
        <span className="patient-section-icon flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" aria-hidden="true" /></span>
        <div className="flex-1"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{title}</h3><span className="text-xs font-medium tabular-nums text-muted-foreground">{String(index + 1).padStart(2, "0")}</span></div>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div>
      </div>
      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
