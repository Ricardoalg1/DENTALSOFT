"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CalendarClock, FilePlus2, MapPin, Stethoscope } from "lucide-react";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { hasStarted, timeOf } from "@/lib/agenda-time";
import { formatDate } from "@/lib/format";
import type { Appointment, AppointmentStatus } from "@/lib/types";
import { changeAppointmentStatus } from "./actions";
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
          {a.reason && (
            <p>
              <span className="text-muted-foreground">Motivo:</span> {a.reason}
            </p>
          )}
          {a.notes && <p className="whitespace-pre-line text-muted-foreground">{a.notes}</p>}
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
