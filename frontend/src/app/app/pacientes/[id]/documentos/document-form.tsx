"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FormError } from "@/components/form-error";
import { RichTextarea } from "@/components/rich-textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ISSUED_KINDS, type IssuedKind } from "@/lib/documents";
import { issueDocument } from "./actions";

const selectClass = "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";
const ORDER_TYPES = ["Radiografías", "Laboratorio clínico", "Interconsulta", "Otros exámenes"];

const longDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Formulario por tipo de documento: con los datos que se piden se arma el texto del documento. */
export function DocumentForm({ patientId, patientName, identification, kind }: { patientId: string; patientName: string; identification: string; kind: IssuedKind }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [today] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" })); // fecha de hoy en Colombia
  const [f, setF] = useState({ days: "3", from: today, diagnosis: "", notes: "", destination: "", reason: "", summary: "", orderType: ORDER_TYPES[0], items: "", date: today, purpose: "", title: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  function build(): { title: string; body: string } | string {
    const who = `**${patientName}**, identificado(a) con ${identification}`;
    if (kind === "DISABILITY") {
      const n = Number(f.days);
      if (!Number.isInteger(n) || n < 1 || n > 365) return "Indica los días de incapacidad (1 a 365).";
      if (!f.diagnosis.trim()) return "Escribe el diagnóstico o motivo.";
      const to = addDays(f.from, n - 1);
      return {
        title: f.title || "Constancia de incapacidad",
        body: `Se certifica que ${who}, fue atendido(a) en consulta odontológica y, por su condición clínica, requiere **incapacidad por ${n} ${n === 1 ? "día" : "días"}**, desde el ${longDate(f.from)} hasta el ${longDate(to)}.\n\n**Diagnóstico / motivo:** ${f.diagnosis.trim()}${f.notes.trim() ? `\n\n**Recomendaciones:**\n${f.notes.trim()}` : ""}`,
      };
    }
    if (kind === "REFERRAL") {
      if (!f.destination.trim() || !f.reason.trim()) return "Indica a dónde se remite y el motivo.";
      return {
        title: f.title || "Remisión",
        body: `Se remite a ${who}, a: **${f.destination.trim()}**.\n\n**Motivo de la remisión:** ${f.reason.trim()}${f.summary.trim() ? `\n\n**Resumen clínico:**\n${f.summary.trim()}` : ""}`,
      };
    }
    if (kind === "ORDER") {
      if (!f.items.trim()) return "Escribe lo que se solicita.";
      return {
        title: f.title || `Orden de ${f.orderType.toLowerCase()}`,
        body: `Paciente: ${who}.\n\n**Se solicita (${f.orderType.toLowerCase()}):**\n${f.items.trim()}${f.diagnosis.trim() ? `\n\n**Diagnóstico / motivo:** ${f.diagnosis.trim()}` : ""}${f.notes.trim() ? `\n\n**Indicaciones:**\n${f.notes.trim()}` : ""}`,
      };
    }
    return {
      title: f.title || "Constancia de asistencia",
      body: `Se hace constar que ${who}, asistió a consulta odontológica el día ${longDate(f.date)}${f.purpose.trim() ? `.\n\n**Motivo:** ${f.purpose.trim()}` : "."}${f.notes.trim() ? `\n\n${f.notes.trim()}` : ""}`,
    };
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    const built = build();
    if (typeof built === "string") return setError(built);
    startTransition(async () => {
      const r = await issueDocument(patientId, { kind, ...built });
      if (!r.ok) return setError(r.error);
      router.push(`/app/pacientes/${patientId}/documentos/${r.id}`);
    });
  }

  const field = (id: string, label: string, node: React.ReactNode) => (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {node}
    </div>
  );

  return (
    <form onSubmit={submit} className="grid gap-4">
      <FormError message={error} />
      <Card>
        <CardHeader>
          <CardTitle>{ISSUED_KINDS[kind].label}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {field("doc-title", "Título (opcional)", <Input id="doc-title" maxLength={150} value={f.title} onChange={set("title")} placeholder={ISSUED_KINDS[kind].label} />)}
          {kind === "DISABILITY" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                {field("days", "Días de incapacidad", <Input id="days" type="number" min={1} max={365} value={f.days} onChange={set("days")} />)}
                {field("from", "Desde", <Input id="from" type="date" value={f.from} onChange={set("from")} />)}
              </div>
              {field("diagnosis", "Diagnóstico o motivo *", <Input id="diagnosis" maxLength={300} value={f.diagnosis} onChange={set("diagnosis")} />)}
              {field("notes", "Recomendaciones", <RichTextarea id="notes" rows={4} maxLength={3000} value={f.notes} onChange={set("notes")} />)}
            </>
          )}
          {kind === "REFERRAL" && (
            <>
              {field("destination", "Se remite a (especialidad, servicio o profesional) *", <Input id="destination" maxLength={200} value={f.destination} onChange={set("destination")} placeholder="Ej.: Cirugía oral y maxilofacial" />)}
              {field("reason", "Motivo de la remisión *", <Input id="reason" maxLength={300} value={f.reason} onChange={set("reason")} />)}
              {field("summary", "Resumen clínico", <RichTextarea id="summary" rows={6} maxLength={4000} value={f.summary} onChange={set("summary")} />)}
            </>
          )}
          {kind === "ORDER" && (
            <>
              {field("orderType", "Tipo de orden", (
                <select id="orderType" className={selectClass} value={f.orderType} onChange={set("orderType")}>
                  {ORDER_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              ))}
              {field("items", "Qué se solicita *", <RichTextarea id="items" rows={5} maxLength={3000} value={f.items} onChange={set("items")} />)}
              {field("diagnosis", "Diagnóstico o motivo", <Input id="diagnosis" maxLength={300} value={f.diagnosis} onChange={set("diagnosis")} />)}
              {field("notes", "Indicaciones", <RichTextarea id="notes" rows={3} maxLength={2000} value={f.notes} onChange={set("notes")} />)}
            </>
          )}
          {kind === "CERTIFICATE" && (
            <>
              {field("date", "Fecha de la atención", <Input id="date" type="date" value={f.date} onChange={set("date")} />)}
              {field("purpose", "Motivo de la atención", <Input id="purpose" maxLength={300} value={f.purpose} onChange={set("purpose")} />)}
              {field("notes", "Texto adicional", <RichTextarea id="notes" rows={4} maxLength={3000} value={f.notes} onChange={set("notes")} />)}
            </>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Al emitirlo se firma con tu nombre, registro profesional y firma de Mi cuenta. Después no se puede editar.</p>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Emitiendo…" : "Emitir y firmar"}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => router.push(`/app/pacientes/${patientId}/documentos`)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
