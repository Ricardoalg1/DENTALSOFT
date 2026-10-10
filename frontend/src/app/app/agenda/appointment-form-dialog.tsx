"use client";

import {
  CalendarPlus,
  CalendarDays,
  Clock3,
  Timer,
  UserRound,
  Stethoscope,
  Building2,
  NotebookPen,
  FileText,
  Check,
  LoaderCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useState, useTransition } from "react";
import { FormError } from "@/components/form-error";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CO_OFFSET, minutesBetween, timeOf } from "@/lib/agenda-time";
import type { Appointment, Professional, Site } from "@/lib/types";
import { saveAppointment } from "./actions";
import { PatientPicker, type PickedPatient } from "./patient-picker";

export type AppointmentDraft =
  | {
      mode: "new";
      date: string;
      time: string;
      duration: number;
      dentistId?: string;
      siteId?: string;
    }
  | { mode: "edit"; appointment: Appointment };

type Props = {
  draft: AppointmentDraft;
  professionals: Professional[];
  sites: Site[];
  presetPatient: PickedPatient | null;
  onClose: () => void;
  onSaved: (appointment: Appointment) => void;
};

const DURATIONS: Record<string, string> = {
  "15": "15 min",
  "20": "20 min",
  "30": "30 min",
  "45": "45 min",
  "60": "1 hora",
  "90": "1 h 30 min",
  "120": "2 horas",
};

export function AppointmentFormDialog({
  draft,
  professionals,
  sites,
  presetPatient,
  onClose,
  onSaved,
}: Props) {
  const editing = draft.mode === "edit" ? draft.appointment : null;
  const [patient, setPatient] = useState<PickedPatient | null>(
    editing
      ? {
          id: editing.patient.id,
          fullName: editing.patient.fullName,
          document: `${editing.patient.documentType} ${editing.patient.documentNumber}`,
        }
      : presetPatient,
  );
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const initial = editing
    ? {
        date: editing.startsAt.slice(0, 10),
        time: timeOf(editing.startsAt),
        duration: minutesBetween(editing.startsAt, editing.endsAt),
        dentistId: editing.dentist.id,
        siteId: editing.site.id,
      }
    : draft.mode === "new"
      ? draft
      : null;
  const durationOptions = {
    ...DURATIONS,
    [String(initial!.duration)]: `${initial!.duration} min`,
  };

  function submit(formData: FormData) {
    if (!patient) {
      setError("Selecciona un paciente");
      return;
    }
    const input = {
      patientId: patient.id,
      dentistId: String(formData.get("dentistId")),
      siteId: String(formData.get("siteId")),
      startsAt: `${formData.get("date")}T${formData.get("time")}:00${CO_OFFSET}`,
      durationMinutes: Number(formData.get("duration")),
      reason: String(formData.get("reason") ?? "") || undefined,
      notes: String(formData.get("notes") ?? "") || undefined,
    };
    startTransition(async () => {
      const result = await saveAppointment(editing?.id ?? null, input);
      if (result.ok) {
        toast.success(editing ? "Cita actualizada" : "Cita agendada");
        onSaved(result.data);
      } else setError(result.error);
    });
  }

  // onSubmit (y no <form action>): React 19 resetea el formulario tras cada acción, incluso si falla,
  // y el usuario perdería lo que escribió.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submit(new FormData(e.currentTarget));
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="size-5 text-primary" />
            {editing ? "Editar cita" : "Nueva cita"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          <FormError message={error} />
          <div className="grid gap-1.5">
            <Label className="flex items-center gap-2">
              <UserRound className="size-4 text-primary" />
              Paciente
            </Label>
            <PatientPicker
              value={patient}
              onChange={setPatient}
              disabled={!!editing}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <NativeSelect
              name="dentistId"
              label={
                <span className="flex items-center gap-2">
                  <Stethoscope className="size-4 text-primary" />
                  Profesional
                </span>
              }
              required
              options={Object.fromEntries(
                professionals.map((p) => [p.id, p.fullName]),
              )}
              defaultValue={initial?.dentistId ?? professionals[0]?.id}
            />
            <NativeSelect
              name="siteId"
              label={
                <span className="flex items-center gap-2">
                  <Building2 className="size-4 text-primary" />
                  Sede
                </span>
              }
              required
              options={Object.fromEntries(
                sites.filter((s) => s.active).map((s) => [s.id, s.name]),
              )}
              defaultValue={initial?.siteId ?? sites[0]?.id}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="date" className="flex items-center gap-2">
                <CalendarDays className="size-4 text-primary" />
                Fecha
              </Label>
              <Input
                id="date"
                name="date"
                type="date"
                required
                defaultValue={initial?.date}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="time" className="flex items-center gap-2">
                <Clock3 className="size-4 text-primary" />
                Hora
              </Label>
              <Input
                id="time"
                name="time"
                type="time"
                step={300}
                required
                defaultValue={initial?.time}
              />
            </div>
            <NativeSelect
              name="duration"
              label={
                <span className="flex items-center gap-2">
                  <Timer className="size-4 text-primary" />
                  Duración
                </span>
              }
              options={durationOptions}
              defaultValue={String(initial?.duration)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="reason" className="flex items-center gap-2">
              <FileText className="size-4 text-primary" />
              Motivo
            </Label>
            <Input
              id="reason"
              name="reason"
              maxLength={200}
              placeholder="Ej.: valoración, control de ortodoncia"
              defaultValue={editing?.reason ?? ""}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="notes" className="flex items-center gap-2">
              <NotebookPen className="size-4 text-primary" />
              Notas
            </Label>
            <Textarea
              id="notes"
              name="notes"
              maxLength={1000}
              rows={2}
              defaultValue={editing?.notes ?? ""}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              {pending ? "Guardando…" : editing ? "Guardar cambios" : "Agendar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
