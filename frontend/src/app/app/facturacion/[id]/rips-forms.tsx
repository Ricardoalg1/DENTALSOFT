"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { FormError } from "@/components/form-error";
import { formatDateTime } from "@/lib/format";
import type { InvoiceLine, NoteOption, RipsUser, ServiceRips } from "@/lib/billing";
import { saveRipsService, saveRipsUser } from "../actions";

export function RipsUserForm({ invoiceId, user }: { invoiceId: string; user: RipsUser | null }) {
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  return <form onSubmit={e => {
    e.preventDefault(); const form = new FormData(e.currentTarget);
    const v = (name: string) => String(form.get(name) ?? "").trim();
    setError(undefined); setSaved(false);
    startTransition(async () => {
      const result = await saveRipsUser(invoiceId, { userType: v("userType"), countryResidence: v("countryResidence"), countryOrigin: v("countryOrigin"), municipality: v("municipality") || null, zone: v("zone") || null, incapacity: v("incapacity"), siras: v("siras") || null });
      if (result.ok) setSaved(true); else setError(result.error);
    });
  }} className="grid gap-4">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <CodeField name="userType" label="Tipo de usuario RIPS (01–14)" value={user?.userType} pattern="0[1-9]|1[0-4]" maxLength={2} required />
      <CodeField name="countryResidence" label="País de residencia (código de 3 dígitos)" value={user?.countryResidence} pattern="[0-9]{3}" maxLength={3} placeholder="170 para Colombia" required />
      <CodeField name="countryOrigin" label="País de nacimiento (código de 3 dígitos)" value={user?.countryOrigin} pattern="[0-9]{3}" maxLength={3} required />
      <CodeField name="municipality" label="Municipio DIVIPOLA (si reside en Colombia)" value={user?.municipality} pattern="[0-9]{5}" maxLength={5} />
      <NativeSelect name="zone" label="Zona territorial" options={{ "01": "Urbana (01)", "02": "Rural (02)" }} placeholder="Selecciona la zona" defaultValue={user?.zone ?? ""} />
      <NativeSelect name="incapacity" label="¿Se expidió incapacidad?" options={{ SI: "Sí", NO: "No" }} defaultValue={user?.incapacity ?? ""} placeholder="Selecciona" required />
      <CodeField name="siras" label="Registro SIRAS (cuando corresponda)" value={user?.siras} maxLength={60} />
    </div>
    <p className="text-xs text-muted-foreground">La cobertura y los países deben corresponder a la atención. Consulta los códigos en las tablas de referencia SISPRO.</p>
    <FormError message={error} />{saved && <p role="status" className="text-sm text-primary">Datos del paciente guardados.</p>}
    <Button disabled={pending} className="w-fit">Guardar datos RIPS del paciente</Button>
  </form>;
}

export function ServiceRipsForm({ invoiceId, line, notes }: { invoiceId: string; line: InvoiceLine; notes: NoteOption[] }) {
  const r = line.rips;
  const [kind, setKind] = useState<ServiceRips["kind"]>(r?.kind ?? "PROCEDURE");
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  return <form onSubmit={e => {
    e.preventDefault(); const form = new FormData(e.currentTarget);
    const v = (name: string) => String(form.get(name) ?? "").trim();
    setError(undefined); setSaved(false);
    startTransition(async () => {
      const result = await saveRipsService(invoiceId, line.sourceItemId, {
        clinicalNoteId: v("clinicalNoteId"), cupsCode: v("cupsCode"), kind,
        modality: v("modality"), group: v("group"), serviceCode: Number(v("serviceCode")), purpose: v("purpose"),
        entryRoute: v("entryRoute") || null, cause: v("cause") || null, authorization: v("authorization") || null, mipres: v("mipres") || null,
        collectionConcept: v("collectionConcept"), moderatingPayment: Number(v("moderatingPayment")), moderatingInvoice: v("moderatingInvoice") || null, vida: v("vida") || null,
      });
      if (result.ok) setSaved(true); else setError(result.error);
    });
  }} className="grid gap-4">
    {notes.length === 0 && <p className="text-sm text-destructive">Este paciente no tiene evoluciones firmadas disponibles. Completa y firma la atención en Historia clínica antes de vincularla.</p>}
    <NativeSelect name="clinicalNoteId" id={`note-${line.sourceItemId}`} label="Evolución firmada que soporta este servicio" options={Object.fromEntries(notes.map(n => [n.id, `${formatDateTime(n.attendedAt)} · ${n.diagnosisMain}`]))} placeholder="Selecciona la atención" defaultValue={r?.clinicalNoteId ?? ""} required />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <NativeSelect name="kind" id={`kind-${line.sourceItemId}`} label="Tipo de servicio RIPS" options={{ PROCEDURE: "Procedimiento", CONSULTATION: "Consulta" }} value={kind} onChange={e => setKind(e.target.value as ServiceRips["kind"])} />
      <CodeField prefix={line.sourceItemId} name="cupsCode" label="Código CUPS (6 dígitos)" value={r?.cupsCode ?? line.cupsCode} pattern="[0-9]{6}" maxLength={6} required />
      <CodeField prefix={line.sourceItemId} name="modality" label="Modalidad de atención (2 dígitos)" value={r?.modality} pattern="[0-9]{2}" maxLength={2} required />
      <CodeField prefix={line.sourceItemId} name="group" label="Grupo de servicios (2 dígitos)" value={r?.group} pattern="[0-9]{2}" maxLength={2} required />
      <CodeField prefix={line.sourceItemId} name="serviceCode" label="Código de servicio REPS" value={r ? String(r.serviceCode) : ""} type="number" min="1" max="9999" required />
      <CodeField prefix={line.sourceItemId} name="purpose" label="Finalidad (2 dígitos)" value={r?.purpose} pattern="[0-9]{2}" maxLength={2} required />
      {kind === "PROCEDURE" ? <CodeField prefix={line.sourceItemId} name="entryRoute" label="Vía de ingreso (2 dígitos)" value={r?.entryRoute} pattern="[0-9]{2}" maxLength={2} required /> : <CodeField prefix={line.sourceItemId} name="cause" label="Causa de atención (2 dígitos)" value={r?.cause} pattern="[0-9]{2}" maxLength={2} required />}
      <CodeField prefix={line.sourceItemId} name="authorization" label="Autorización (opcional)" value={r?.authorization} maxLength={30} />
      {kind === "PROCEDURE" && <CodeField prefix={line.sourceItemId} name="mipres" label="ID MIPRES (si aplica)" value={r?.mipres} pattern="[0-9]{1,20}" maxLength={20} />}
      <NativeSelect name="collectionConcept" id={`concept-${line.sourceItemId}`} label="Concepto de recaudo" options={{ "01": "Copago (01)", "02": "Cuota moderadora (02)", "03": "Pago compartido en plan voluntario (03)", "04": "Bono o vale de plan voluntario (04)", "05": "Sin recaudo (05)" }} placeholder="Selecciona" defaultValue={r?.collectionConcept ?? ""} required />
      <CodeField prefix={line.sourceItemId} name="moderatingPayment" label="Valor pago moderador (COP enteros)" value={String(r?.moderatingPayment ?? 0)} type="number" min="0" step="1" required />
      <CodeField prefix={line.sourceItemId} name="moderatingInvoice" label="FEV que soporta el pago moderador" value={r?.moderatingInvoice} maxLength={30} />
      <CodeField prefix={line.sourceItemId} name="vida" label="Código VIDA (si ya aplica a la atención)" value={r?.vida} maxLength={256} />
    </div>
    <p className="text-xs text-muted-foreground">La fecha, el diagnóstico y su tipo se copian de la evolución seleccionada. Verifica que esa evolución documente este servicio.</p>
    <FormError message={error} />{saved && <p role="status" className="text-sm text-primary">Servicio vinculado.</p>}
    <Button disabled={pending || notes.length === 0} className="w-fit">Guardar servicio RIPS</Button>
  </form>;
}

function CodeField({ name, label, value, prefix = "rips", ...props }: { name: string; label: string; value?: string | null; prefix?: string } & Omit<React.ComponentProps<typeof Input>, "name" | "value" | "prefix">) {
  const id = `${prefix}-${name}`;
  return <div className="grid gap-1.5"><Label htmlFor={id}>{label}</Label><Input id={id} name={name} defaultValue={value ?? ""} {...props} /></div>;
}
