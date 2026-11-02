"use client";

import { RichText } from "@/components/rich-text";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { CalendarClock, Copy, FilePlus2, MapPin, MessageCircle, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { FormError } from "@/components/form-error";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { hasStarted, timeOf } from "@/lib/agenda-time";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { VISIT_TYPES, type Appointment, type AppointmentStatus } from "@/lib/types";
import { appointmentInvite, changeAppointmentStatus, type WhatsAppInvite } from "./actions";
import { StatusBadge } from "./status-badge";

type Props = {
  appointment: Appointment;
  canWriteClinical: boolean;
  onClose: () => void;
  onEdit: () => void;
  onChanged: (appointment: Appointment) => void;
};

export function AppointmentDetailsDialog({ appointment: a, canWriteClinical, onClose, onEdit, onChanged }: Props) {
  const [error, setError] = useState<string>();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const open = a.status === "SCHEDULED" || a.status === "CONFIRMED";
  const started = hasStarted(a.startsAt);
  const [invite, setInvite] = useState<WhatsAppInvite>();

  // El mensaje se arma en el servidor con la plantilla del tipo de cita y los datos de la sede.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void appointmentInvite(a.id).then((r) => alive && r.ok && setInvite(r.data));
    return () => {
      alive = false;
    };
  }, [a.id, open]);

  async function copyMessage() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.message);
      toast.success("Mensaje copiado");
    } catch {
      toast.error("No se pudo copiar el mensaje");
    }
  }

  function setStatus(status: AppointmentStatus, cancellationReason?: string) {
    setError(undefined);
    startTransition(async () => {
      const result = await changeAppointmentStatus(a.id, { status, cancellationReason });
      if (result.ok) onChanged(result.data);
      else setError(result.error);
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{a.patient.fullName}</DialogTitle>
          <DialogDescription>
            {a.patient.documentType} {a.patient.documentNumber}
            {a.patient.phone && ` · ${a.patient.phone}`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 text-sm">
          <StatusBadge status={a.status} className="w-fit" />
          <p className="flex items-center gap-2">
            <CalendarClock className="size-4 text-muted-foreground" />
            {formatDate(a.startsAt.slice(0, 10))}, {timeOf(a.startsAt)} – {timeOf(a.endsAt)}
          </p>
          <p className="flex items-center gap-2">
            <Stethoscope className="size-4 text-muted-foreground" /> {a.dentist.name}
          </p>
          <p className="flex items-center gap-2">
            <MapPin className="size-4 text-muted-foreground" /> {a.site.name}
          </p>
          {(a.visitType || a.reason) && (
            <p>
              <span className="text-muted-foreground">Motivo:</span>{" "}
              {[a.visitType && VISIT_TYPES[a.visitType], a.reason].filter(Boolean).join(" · ")}
            </p>
          )}
          {a.notes && <RichText className="text-muted-foreground">{a.notes}</RichText>}
          {a.cancellationReason && (
            <p>
              <span className="text-muted-foreground">Motivo de cancelación:</span> {a.cancellationReason}
            </p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href={`/app/pacientes/${a.patient.id}`} className="w-fit text-primary hover:underline">
              Ver ficha del paciente
            </Link>
            {canWriteClinical && started && (a.status === "ATTENDED" || open) && (
              <Link
                href={`/app/pacientes/${a.patient.id}/historia/nueva?appointmentId=${a.id}`}
                className="inline-flex w-fit items-center gap-1 text-primary hover:underline"
              >
                <FilePlus2 className="size-4" /> Registrar evolución
              </Link>
            )}
          </div>
        </div>

        <FormError message={error} />

        {open && invite && (
          <div className="grid gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="flex flex-wrap gap-2">
              {invite.url ? (
                // Pestaña con nombre: los siguientes envíos reutilizan la misma pestaña de WhatsApp.
                <a
                  href={invite.url}
                  target="occlus-whatsapp"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants(), "bg-emerald-600 text-white hover:bg-emerald-700")}
                >
                  <MessageCircle /> Enviar invitación por WhatsApp
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">
                  El paciente no tiene un celular válido para WhatsApp. Actualízalo en su ficha o copia el mensaje.
                </p>
              )}
              <Button variant="outline" onClick={() => void copyMessage()}>
                <Copy /> Copiar mensaje
              </Button>
            </div>
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Ver mensaje</summary>
              <p className="mt-2 whitespace-pre-line">{invite.message}</p>
            </details>
          </div>
        )}

        {open && !cancelling && (
          <div className="flex flex-wrap gap-2">
            {a.status === "SCHEDULED" && (
              <Button disabled={pending} onClick={() => setStatus("CONFIRMED")}>
                Confirmar
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={pending || !started}
              title={started ? undefined : "Disponible cuando llegue la hora de la cita"}
              onClick={() => setStatus("ATTENDED")}
            >
              Atendida
            </Button>
            <Button
              variant="secondary"
              disabled={pending || !started}
              title={started ? undefined : "Disponible cuando llegue la hora de la cita"}
              onClick={() => setStatus("NO_SHOW")}
            >
              No asistió
            </Button>
            <Button variant="outline" disabled={pending} onClick={onEdit}>
              Editar
            </Button>
            <Button variant="destructive" disabled={pending} onClick={() => setCancelling(true)}>
              Cancelar cita
            </Button>
          </div>
        )}

        {cancelling && (
          <div className="grid gap-2">
            <Label htmlFor="cancel-reason">Motivo de la cancelación (opcional)</Label>
            <Textarea id="cancel-reason" value={reason} maxLength={200} rows={2} onChange={(e) => setReason(e.target.value)} />
            <div className="flex gap-2">
              <Button variant="destructive" disabled={pending} onClick={() => setStatus("CANCELLED", reason || undefined)}>
                {pending ? "Cancelando…" : "Confirmar cancelación"}
              </Button>
              <Button variant="outline" disabled={pending} onClick={() => setCancelling(false)}>
                Volver
              </Button>
            </div>
          </div>
        )}

        {!open && (
          <p className="text-xs text-muted-foreground">
            Esta cita ya está cerrada. Para volver a atender al paciente, agenda una nueva.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
