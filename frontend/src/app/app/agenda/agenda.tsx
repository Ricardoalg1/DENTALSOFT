"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import esLocale from "@fullcalendar/core/locales/es";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import timeGridPlugin from "@fullcalendar/timegrid";
import type {
  DateSelectArg,
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventInput,
  EventSourceFuncArg,
} from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import { EmptyState } from "@/components/app/reference-art";
import { Plus } from "lucide-react";
import { FormError } from "@/components/form-error";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/use-media-query";
import { minutesBetween, nowWall, todayCO, toWall, wallToApi } from "@/lib/agenda-time";
import type { Appointment, Professional, ScheduleBlock, Site } from "@/lib/types";
import { saveAppointment } from "./actions";
import { AppointmentDetailsDialog } from "./appointment-details-dialog";
import { AppointmentFormDialog, type AppointmentDraft } from "./appointment-form-dialog";
import type { PickedPatient } from "./patient-picker";
import { STATUS_COLORS } from "./status-badge";

type Props = {
  professionals: Professional[];
  sites: Site[];
  schedules: ScheduleBlock[];
  presetPatient: PickedPatient | null;
  defaultDentistId?: string;
  /** Profesional con acceso a la historia clínica: puede registrar la evolución desde la cita. */
  canWriteClinical: boolean;
};

export function Agenda({ professionals, sites, schedules, presetPatient, defaultDentistId, canWriteClinical }: Props) {
  const calendarRef = useRef<FullCalendar>(null);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [dentistId, setDentistId] = useState(defaultDentistId ?? "");
  const [siteId, setSiteId] = useState("");
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState<AppointmentDraft | null>(null);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [patientForNext, setPatientForNext] = useState(presetPatient);

  // Cambiar la función recarga los eventos (FullCalendar compara la referencia).
  const fetchEvents = useCallback(
    async (info: EventSourceFuncArg): Promise<EventInput[]> => {
      const params = new URLSearchParams({ from: wallToApi(info.start), to: wallToApi(info.end) });
      if (dentistId) params.set("dentistId", dentistId);
      if (siteId) params.set("siteId", siteId);
      const res = await fetch(`/bff/appointments?${params}`);
      if (res.status === 401) {
        // /salir es un route handler (borra la cookie): requiere navegación completa, no router.push.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/salir";
        return [];
      }
      if (!res.ok) {
        setError("No se pudieron cargar las citas");
        return [];
      }
      const list: Appointment[] = await res.json();
      return list.map((a) => {
        const color = STATUS_COLORS[a.status];
        const open = a.status === "SCHEDULED" || a.status === "CONFIRMED";
        return {
          id: a.id,
          title: a.patient.fullName,
          start: toWall(a.startsAt),
          end: toWall(a.endsAt),
          backgroundColor: color.bg,
          borderColor: color.border,
          textColor: color.text,
          editable: open,
          extendedProps: { appointment: a },
        };
      });
    },
    [dentistId, siteId],
  );

  // Horario de atención sombreado en el calendario (FullCalendar: 0 = domingo).
  const businessHours = useMemo(() => {
    const blocks = schedules.filter(
      (b) => (!dentistId || b.dentistId === dentistId) && (!siteId || b.siteId === siteId),
    );
    if (blocks.length === 0) return undefined;
    return blocks.map((b) => ({
      daysOfWeek: [b.dayOfWeek % 7],
      startTime: b.startTime.slice(0, 5),
      endTime: b.endTime.slice(0, 5),
    }));
  }, [schedules, dentistId, siteId]);

  const refetch = () => calendarRef.current?.getApi().refetchEvents();

  function openNew(start?: Date, end?: Date) {
    const base = start ?? new Date(`${todayCO()}T08:00:00Z`);
    const iso = base.toISOString();
    const duration = start && end ? Math.round((end.getTime() - start.getTime()) / 60000) : 30;
    setDraft({
      mode: "new",
      date: iso.slice(0, 10),
      time: iso.slice(11, 16),
      duration: duration >= 5 && duration <= 480 ? duration : 30,
      dentistId: dentistId || undefined,
      siteId: siteId || undefined,
    });
  }

  function onSelect(arg: DateSelectArg) {
    arg.view.calendar.unselect();
    if (arg.allDay) {
      // En la vista de mes: ir al día para elegir la hora.
      arg.view.calendar.changeView("timeGridDay", arg.start);
      return;
    }
    openNew(arg.start, arg.end);
  }

  function onEventClick(arg: EventClickArg) {
    setSelected(arg.event.extendedProps.appointment as Appointment);
  }

  /** Arrastrar o estirar una cita la reprograma; si el backend la rechaza, vuelve a su lugar. */
  async function onMoveOrResize(arg: EventDropArg | EventResizeDoneArg) {
    const a = arg.event.extendedProps.appointment as Appointment;
    const start = arg.event.start!;
    const end = arg.event.end ?? new Date(start.getTime() + minutesBetween(a.startsAt, a.endsAt) * 60000);
    setError(undefined);
    const result = await saveAppointment(a.id, {
      patientId: a.patient.id,
      dentistId: a.dentist.id,
      siteId: a.site.id,
      startsAt: wallToApi(start),
      durationMinutes: Math.round((end.getTime() - start.getTime()) / 60000),
      reason: a.reason ?? undefined,
      notes: a.notes ?? undefined,
    });
    if (result.ok) {
      arg.event.setExtendedProp("appointment", result.data);
    } else {
      arg.revert();
      setError(result.error);
    }
  }

  function renderEvent(arg: EventContentArg) {
    const a = arg.event.extendedProps.appointment as Appointment;
    return (
      <div className="overflow-hidden px-0.5 leading-tight">
        <p className="text-[11px] opacity-80">{arg.timeText}</p>
        <p className="truncate font-medium">{a.patient.fullName}</p>
        {!dentistId && <p className="truncate text-[11px] opacity-80">{a.dentist.name}</p>}
        {a.reason && <p className="truncate text-[11px] opacity-80">{a.reason}</p>}
      </div>
    );
  }

  if (professionals.length === 0) {
    return (
      <div className="grid gap-6"><div className="reference-panel"><p className="font-semibold">No hay profesionales activos.</p><p className="mt-1 text-muted-foreground">Un administrador debe marcar en <strong>Equipo</strong> quién atiende pacientes.</p></div><div className="reference-panel"><EmptyState kind="agenda" title="Tu agenda está lista para empezar" description="Aquí podrás ver tus citas, gestionar tu disponibilidad y arrastrar una cita para reprogramarla de forma fácil y rápida." /></div></div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-56">
          <NativeSelect
            name="filterDentist"
            label="Profesional"
            options={Object.fromEntries(professionals.map((p) => [p.id, p.fullName]))}
            placeholder="Todos"
            value={dentistId}
            onChange={(e) => setDentistId(e.target.value)}
          />
        </div>
        {sites.length > 1 && (
          <div className="w-full sm:w-48">
            <NativeSelect
              name="filterSite"
              label="Sede"
              options={Object.fromEntries(sites.map((s) => [s.id, s.name]))}
              placeholder="Todas"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
            />
          </div>
        )}
        <Button className="sm:ml-auto" onClick={() => openNew()}>
          <Plus /> Nueva cita
        </Button>
      </div>

      {patientForNext && (
        <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          Selecciona un horario en el calendario para agendar a <strong>{patientForNext.fullName}</strong>.
        </p>
      )}
      <FormError message={error} />

      <div className="rounded-xl border bg-card p-2 sm:p-4">
        <FullCalendar
          key={isMobile ? "mobile" : "desktop"}
          ref={calendarRef}
          plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
          locale={esLocale}
          timeZone="UTC"
          now={nowWall}
          initialView={isMobile ? "timeGridDay" : "timeGridWeek"}
          headerToolbar={
            isMobile
              ? { left: "prev,next", center: "title", right: "today" }
              : { left: "prev,next today", center: "title", right: "timeGridDay,timeGridWeek,dayGridMonth" }
          }
          height="auto"
          slotMinTime="06:00:00"
          slotMaxTime="21:00:00"
          slotDuration="00:15:00"
          slotLabelInterval="01:00"
          scrollTime="07:00:00"
          allDaySlot={false}
          nowIndicator
          selectable
          selectMirror
          editable
          eventDurationEditable
          eventStartEditable
          businessHours={businessHours}
          events={fetchEvents}
          select={onSelect}
          eventClick={onEventClick}
          eventDrop={onMoveOrResize}
          eventResize={onMoveOrResize}
          eventContent={renderEvent}
        />
      </div>

      {draft && (
        <AppointmentFormDialog
          key={draft.mode === "edit" ? draft.appointment.id : `${draft.date}-${draft.time}`}
          draft={draft}
          professionals={professionals}
          sites={sites}
          presetPatient={patientForNext}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            setPatientForNext(null);
            refetch();
          }}
        />
      )}

      {selected && (
        <AppointmentDetailsDialog
          key={selected.id + selected.status}
          appointment={selected}
          canWriteClinical={canWriteClinical}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setDraft({ mode: "edit", appointment: selected });
            setSelected(null);
          }}
          onChanged={(updated) => {
            setSelected(updated);
            refetch();
          }}
        />
      )}
    </div>
  );
}
