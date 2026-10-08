"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormError } from "@/components/form-error";
import { NativeSelect } from "@/components/native-select";
import { formatDateTime } from "@/lib/format";
import { DELIVERY_STATUSES, MESSAGE_ACTIONS, MESSAGE_STATUSES, type Message, type MessagingOverview } from "@/lib/messaging";
import { resolveMessage, runMessaging, saveMessagingSettings, simulateReply } from "./actions";

export function MessagingPanel({ data, admin }: { data: MessagingOverview; admin: boolean }) {
  const [pending, start] = useTransition(); const [error, setError] = useState<string>(); const [notice, setNotice] = useState<string>();
  const [onlyAttention, setOnlyAttention] = useState(false); const [search, setSearch] = useState(""); const router = useRouter();
  const reminders = data.messages.filter(m => m.kind === "REMINDER" && m.status === "SIMULATED" && m.simulated);
  const visible = data.messages.filter(m => (!onlyAttention || (m.needsAttention && !m.resolvedAt)) && `${m.patientName ?? ""} ${m.phone} ${m.body}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="mx-auto grid max-w-5xl gap-6">
    <header><h1 className="text-2xl font-semibold tracking-tight">Mensajes y recordatorios</h1><p className="text-muted-foreground">Gestiona las respuestas de pacientes y los recordatorios de la agenda.</p></header>
    <div className="rounded-xl border p-4 text-sm"><p className="font-medium">{data.channel.simulated ? "Modo simulado" : "WhatsApp conectado"}</p><p className="mt-1 text-muted-foreground">{data.channel.message}</p><p className="mt-2">Automatización: {data.channel.schedulerEnabled ? "activa" : "apagada; utiliza el botón para ejecutar un ciclo"} · IA: {data.channel.aiAvailable && data.settings.aiEnabled && !data.channel.simulated ? "activa para clasificación" : "reglas locales"}</p></div>
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="font-medium">{data.attentionCount} mensajes requieren atención</p><Button disabled={pending} onClick={() => {
      setError(undefined); setNotice(undefined); start(async () => { const r = await runMessaging(); if (!r.ok) setError(r.error); else { setNotice(`${r.queued ?? 0} recordatorios nuevos. Revisa el historial para ver el resultado del ciclo.`); router.refresh(); } });
    }}>{pending ? "Procesando…" : data.channel.simulated ? "Ejecutar ciclo simulado" : "Enviar recordatorios y procesar respuestas"}</Button></div>
    <FormError message={error} />{notice && <p role="status" className="text-sm text-primary">{notice}</p>}
    {admin && <Card><CardHeader><CardTitle>Configuración de la clínica</CardTitle></CardHeader><CardContent>
      <form className="grid gap-4" onSubmit={e => {
        e.preventDefault(); const f = new FormData(e.currentTarget); setError(undefined); setNotice(undefined);
        start(async () => { const r = await saveMessagingSettings({ remindersEnabled: f.get("remindersEnabled") === "on", hoursBefore: Number(f.get("hoursBefore")), aiEnabled: f.get("aiEnabled") === "on" }); if (!r.ok) setError(r.error); else { setNotice("Configuración guardada."); router.refresh(); } });
      }}>
        <label className="flex items-center gap-2 text-sm"><input name="remindersEnabled" type="checkbox" defaultChecked={data.settings.remindersEnabled} />Activar recordatorios para esta clínica</label>
        <div className="grid max-w-xs gap-1.5"><Label htmlFor="hours-before">Horas antes de la cita</Label><Input id="hours-before" name="hoursBefore" type="number" min={2} max={72} step={1} required defaultValue={data.settings.hoursBefore} /></div>
        <label className="flex items-center gap-2 text-sm"><input name="aiEnabled" type="checkbox" defaultChecked={data.settings.aiEnabled} />Usar Claude para clasificar respuestas libres cuando el servicio esté configurado</label>
        <p className="text-xs text-muted-foreground">Solo reciben recordatorios los pacientes activos que autorizaron WhatsApp. Las clasificaciones de IA se revisan en recepción; las solicitudes de reprogramación no cambian la agenda automáticamente.</p>
        <Button className="w-fit" disabled={pending}>Guardar configuración</Button>
      </form>
    </CardContent></Card>}
    {data.channel.simulated && <Card><CardHeader><CardTitle>Simular respuesta de un paciente</CardTitle></CardHeader><CardContent>
      <p className="mb-3 text-sm text-muted-foreground">La simulación puede confirmar o cancelar una cita real de tu agenda. No envía WhatsApp ni consume créditos de IA.</p>
      <form className="grid gap-3" onSubmit={e => {
        e.preventDefault(); const el = e.currentTarget; const f = new FormData(el); setError(undefined); setNotice(undefined);
        start(async () => { const r = await simulateReply(String(f.get("reminder")), String(f.get("reply"))); if (!r.ok) setError(r.error); else { setNotice("Respuesta procesada. Revisa el historial y la agenda."); const input = el.elements.namedItem("reply") as HTMLInputElement; input.value = ""; router.refresh(); } });
      }}>
        <NativeSelect name="reminder" label="Recordatorio" options={Object.fromEntries(reminders.map(m => [m.id, `${m.patientName || m.phone} · ${m.appointmentStartsAt ? formatDateTime(m.appointmentStartsAt) : "Sin fecha"}`]))} placeholder="Selecciona un recordatorio simulado" required />
        <div className="grid gap-1.5"><Label htmlFor="simulated-reply">Respuesta</Label><Input id="simulated-reply" name="reply" required maxLength={2000} placeholder="CONFIRMO, CANCELAR, REPROGRAMAR, BAJA o una pregunta" /></div>
        <Button className="w-fit" disabled={pending || reminders.length === 0}>Procesar respuesta simulada</Button>
      </form>
      {reminders.length === 0 && <p className="mt-3 text-xs text-muted-foreground">Activa recordatorios, autoriza WhatsApp en un paciente con celular colombiano y agenda una cita dentro del plazo configurado. Luego ejecuta un ciclo simulado.</p>}
    </CardContent></Card>}
    <Card><CardHeader><CardTitle>Bandeja de mensajes</CardTitle></CardHeader><CardContent className="grid gap-4">
      <div className="flex flex-wrap items-center gap-4"><Input className="max-w-sm" aria-label="Buscar mensajes" value={search} onChange={e => setSearch(e.target.value)} placeholder="Paciente, teléfono o mensaje" /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyAttention} onChange={e => setOnlyAttention(e.target.checked)} />Solo pendientes</label></div>
      <p className="text-xs text-muted-foreground">Hasta 100 mensajes, priorizando los pendientes de atención. Una vez atendidos, aparecerán los siguientes.</p>
      {visible.length === 0 && <p className="text-sm text-muted-foreground">No hay mensajes para mostrar.</p>}
      {visible.map(m => <MessageCard key={m.id} message={m} />)}
    </CardContent></Card>
  </div>;
}

function MessageCard({ message: m }: { message: Message }) {
  const [pending, start] = useTransition(); const [error, setError] = useState<string>(); const router = useRouter();
  return <article className="grid gap-2 rounded-xl border p-4 text-sm">
    <div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{m.direction === "IN" ? "Recibido" : "Saliente"} · {m.patientName || "Paciente sin identificar"}</p><span>{MESSAGE_STATUSES[m.status] ?? m.status}{m.deliveryStatus && ` · ${DELIVERY_STATUSES[m.deliveryStatus] ?? m.deliveryStatus}`}</span></div>
    <p className="text-xs text-muted-foreground">{m.phone} · {formatDateTime(m.createdAt)}{m.appointmentStartsAt && ` · Cita ${formatDateTime(m.appointmentStartsAt)}`}</p>
    <p className="whitespace-pre-wrap break-words">{m.body}</p>
    {m.action && <p className="font-medium">{MESSAGE_ACTIONS[m.action] ?? m.action}</p>}
    {m.intentSummary && <p>{m.intentSummary}{m.intentSource && ` · ${m.intentSource === "AI" ? "Clasificado por IA" : m.intentSource === "BUTTON" ? "Botón" : "Reglas locales"}`}</p>}
    {m.error && <p className="text-destructive">{m.error}</p>}
    <div className="flex flex-wrap gap-4 text-xs">{m.patientId && <Link className="text-primary hover:underline" href={`/app/pacientes/${m.patientId}`}>Abrir paciente</Link>}{m.appointmentId && <Link className="text-primary hover:underline" href="/app/agenda">Abrir agenda</Link>}</div>
    {m.needsAttention && !m.resolvedAt && <form className="flex flex-wrap gap-2" onSubmit={e => {
      e.preventDefault(); const f = new FormData(e.currentTarget); setError(undefined); start(async () => { const r = await resolveMessage(m.id, String(f.get("note"))); if (!r.ok) setError(r.error); else router.refresh(); });
    }}><Input className="min-w-48 flex-1" name="note" required minLength={3} maxLength={300} aria-label="Cómo se atendió el mensaje" placeholder="Describe cómo se atendió el mensaje" /><Button variant="outline" disabled={pending}>{pending ? "Guardando…" : "Marcar atendido"}</Button></form>}
    {m.resolvedAt && <p className="text-xs text-muted-foreground">Atendido el {formatDateTime(m.resolvedAt)}{m.resolutionNote && ` · ${m.resolutionNote}`}</p>}<FormError message={error} />
  </article>;
}
