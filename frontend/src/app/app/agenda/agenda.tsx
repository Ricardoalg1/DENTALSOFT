"use client";

import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import FullCalendar from "@fullcalendar/react";
import esLocale from "@fullcalendar/core/locales/es";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import timeGridPlugin from "@fullcalendar/timegrid";
import type {
  DateSelectArg,
  DatesSetArg,
  DayHeaderContentArg,
  EventApi,
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventInput,
  EventSourceFuncArg,
} from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import { EmptyState } from "@/components/app/reference-art";
import { Ban, CalendarClock, CheckCheck, CircleCheck, Plus, UserX, type LucideIcon } from "lucide-react";
import { FormError } from "@/components/form-error";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/use-media-query";
import { minutesBetween, nowWall, todayCO, toWall, wallToApi } from "@/lib/agenda-time";
import {
  APPOINTMENT_STATUS,
  VISIT_TYPES,
  type Appointment,
  type AppointmentStatus,
  type Professional,
  type ScheduleBlock,
  type Site,
  type TimeOff,
  type VisitType,
} from "@/lib/types";
import { saveAppointment } from "./actions";
import { AgendaBackdrop } from "./agenda-backdrop";
import { AppointmentDetailsDialog } from "./appointment-details-dialog";
import { AppointmentFormDialog, type AppointmentDraft } from "./appointment-form-dialog";
import type { PickedPatient } from "./patient-picker";

/** El color de la cita indica su tipo; el estado se reconoce por este ícono. */
const STATUS_ICONS: Record<AppointmentStatus, LucideIcon> = {
  SCHEDULED: CalendarClock,
  CONFIRMED: CircleCheck,
  ATTENDED: CheckCheck,
  NO_SHOW: UserX,
  CANCELLED: Ban,
};

/** Rango del calendario cuando no hay horarios configurados ni citas en la vista. */
const DEFAULT_HOURS = { start: 6, end: 21 };

const hourOf = (time: string) => Number(time.slice(0, 2));
const toSlotTime = (hour: number) => `${String(hour).padStart(2, "0")}:00:00`;

type Props = {
  professionals: Professional[];
  sites: Site[];
  schedules: ScheduleBlock[];
  timeOff: TimeOff[];
  presetPatient: PickedPatient | null;
  defaultDentistId?: string;
  /** Profesional con acceso a la historia clínica: puede registrar la evolución desde la cita. */
  canWriteClinical: boolean;
};

const startOfDay = (d: Date) => new Date(`${d.toISOString().slice(0, 10)}T00:00:00Z`);
const endOfDay = (d: Date) => {
  const start = startOfDay(d);
  return start.getTime() === d.getTime() ? d : new Date(start.getTime() + 86_400_000);
};

export function Agenda({ professionals, sites, schedules, timeOff, presetPatient, defaultDentistId, canWriteClinical }: Props) {
  const calendarRef = useRef<FullCalendar>(null);
  const pendingFetches = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  // Cita recién soltada: marca un instante dónde quedó.
  const [settledId, setSettledId] = useState<string>();
  const settleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Horas con citas en la vista: se muestran altas; las vacías quedan compactas.
  const [busyHours, setBusyHours] = useState<number[]>([]);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [dentistId, setDentistId] = useState(defaultDentistId ?? "");
  const [siteId, setSiteId] = useState("");
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState<AppointmentDraft | null>(null);
  const [selected, setSelected] = useState<Appointment | null>(null);
  // Desde dónde crece el detalle: la tarjeta de la cita que se abrió.
  const [modalOrigin, setModalOrigin] = useState<CSSProperties>();
  const [patientForNext, setPatientForNext] = useState(presetPatient);

  // Cambiar la función recarga los eventos (FullCalendar compara la referencia).
  const fetchEvents = useCallback(
    async (info: EventSourceFuncArg): Promise<EventInput[]> => {
      // Días completos: FullCalendar recorta el rango a las horas visibles, y esas horas dependen de las citas.
      const params = new URLSearchParams({
        from: wallToApi(startOfDay(info.start)),
        to: wallToApi(endOfDay(info.end)),
      });
      if (dentistId) params.set("dentistId", dentistId);
      if (siteId) params.set("siteId", siteId);
      pendingFetches.current++;
      try {
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
          const open = a.status === "SCHEDULED" || a.status === "CONFIRMED";
          return {
            id: a.id,
            title: a.patient.fullName,
            start: toWall(a.startsAt),
            end: toWall(a.endsAt),
            classNames: ["agenda-event", `agenda-type-${a.visitType ?? "NONE"}`, `agenda-status-${a.status}`],
            editable: open,
            extendedProps: { appointment: a },
          };
        });
      } finally {
        pendingFetches.current--;
      }
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

  // Ausencias (festivos, vacaciones, descansos puntuales) sombreadas en rojo suave.
  const timeOffEvents = useMemo<EventInput[]>(() => {
    const out: EventInput[] = [];
    for (const t of timeOff) {
      if (dentistId && t.dentistId !== dentistId) continue;
      const first = new Date(`${t.fromDate}T00:00:00Z`);
      const last = new Date(`${t.toDate}T00:00:00Z`);
      for (let d = first, n = 0; d <= last && n < 400; d = new Date(d.getTime() + 86_400_000), n++) {
        const day = d.toISOString().slice(0, 10);
        out.push({
          start: t.startTime ? `${day}T${t.startTime.slice(0, 5)}:00` : `${day}T00:00:00`,
          end: t.endTime ? `${day}T${t.endTime.slice(0, 5)}:00` : `${day}T23:59:59`,
          display: "background",
          color: "#ef4444",
          title: t.reason || "Sin atención",
        });
      }
    }
    return out;
  }, [timeOff, dentistId]);

  const eventSources = useMemo(() => [fetchEvents, timeOffEvents], [fetchEvents, timeOffEvents]);

  /** Recalcula las horas ocupadas con las citas del periodo visible (también al mover una). */
  const syncBusyHours = useCallback((events: EventApi[]) => {
    const view = calendarRef.current?.getApi().view;
    if (!view || pendingFetches.current > 0) return;
    const hours = new Set<number>();
    for (const e of events) {
      if (!e.extendedProps.appointment || !e.start) continue;
      const end = e.end ?? e.start;
      if (end <= view.currentStart || e.start >= view.currentEnd) continue;
      const lastHour = new Date(Math.max(e.start.getTime(), end.getTime() - 1)).getUTCHours();
      for (let h = e.start.getUTCHours(); h <= lastHour; h++) hours.add(h);
    }
    const next = [...hours].sort((a, b) => a - b);
    setBusyHours((prev) => (prev.join() === next.join() ? prev : next));
  }, []);

  function onDatesSet(arg: DatesSetArg) {
    syncBusyHours(arg.view.calendar.getEvents());
  }

  // La grilla va del primer al último horario o cita; las horas por fuera no se muestran.
  const visibleHours = useMemo(() => {
    const starts = (businessHours ?? []).map((b) => hourOf(b.startTime));
    const ends = (businessHours ?? []).map((b) => hourOf(b.endTime) + (b.endTime.endsWith(":00") ? 0 : 1));
    if (starts.length === 0 && busyHours.length === 0) return DEFAULT_HOURS;
    return {
      start: Math.min(...starts, ...busyHours),
      end: Math.max(...ends, ...busyHours.map((h) => h + 1)),
    };
  }, [businessHours, busyHours]);

  const slotClass = useCallback(
    (arg: { date?: Date }) =>
      arg.date && busyHours.includes(arg.date.getUTCHours()) ? "agenda-slot-busy" : "agenda-slot-idle",
    [busyHours],
  );

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
    const a = arg.event.extendedProps.appointment as Appointment | undefined;
    if (!a) return;
    const card = arg.el.getBoundingClientRect();
    setModalOrigin({
      "--modal-from-x": `${card.left + card.width / 2 - window.innerWidth / 2}px`,
      "--modal-from-y": `${card.top + card.height / 2 - window.innerHeight / 2}px`,
      "--modal-from-scale": Math.min(0.6, Math.max(0.2, card.width / 448)),
    } as CSSProperties);
    setSelected(a);
  }

  /** Arrastrar o estirar una cita la reprograma; si el backend la rechaza, vuelve a su lugar. */
  async function onMoveOrResize(arg: EventDropArg | EventResizeDoneArg) {
    const a = arg.event.extendedProps.appointment as Appointment;
    const start = arg.event.start!;
    const end = arg.event.end ?? new Date(start.getTime() + minutesBetween(a.startsAt, a.endsAt) * 60000);
    setError(undefined);
    clearTimeout(settleTimer.current);
    setSettledId(a.id);
    settleTimer.current = setTimeout(() => setSettledId(undefined), 900);
    const result = await saveAppointment(a.id, {
      patientId: a.patient.id,
      dentistId: a.dentist.id,
      siteId: a.site.id,
      startsAt: wallToApi(start),
      durationMinutes: Math.round((end.getTime() - start.getTime()) / 60000),
      visitType: a.visitType ?? undefined,
      reason: a.reason ?? undefined,
      notes: a.notes ?? undefined,
    });
    if (result.ok) {
      arg.event.setExtendedProp("appointment", result.data);
    } else {
      setSettledId(undefined);
      arg.revert();
      setError(result.error);
    }
  }

  const eventClass = useCallback(
    (arg: { event: EventApi }) => (arg.event.id === settledId ? "agenda-event-settled" : ""),
    [settledId],
  );

  function renderEvent(arg: EventContentArg) {
    const a = arg.event.extendedProps.appointment as Appointment | undefined;
    if (!a) return undefined;
    const StatusIcon = STATUS_ICONS[a.status];
    const detail = [a.visitType && VISIT_TYPES[a.visitType], a.reason].filter(Boolean).join(" · ");
    const summary = [
      arg.timeText,
      a.patient.fullName,
      a.dentist.name,
      detail,
      APPOINTMENT_STATUS[a.status],
    ].filter(Boolean).join("\n");
    if (arg.view.type === "dayGridMonth") {
      return (
        <div className="agenda-card-inline" title={summary}>
          <StatusIcon aria-hidden="true" />
          <span className="agenda-card-time">{arg.timeText}</span>
          <span className="agenda-card-name">{a.patient.fullName}</span>
        </div>
      );
    }
    return (
      <div className="agenda-card" title={summary}>
        <div className="agenda-card-body">
          <p className="agenda-card-time">
            <StatusIcon aria-hidden="true" />
            <span>{arg.timeText}</span>
          </p>
          <p className="agenda-card-name">{a.patient.fullName}</p>
          {!dentistId && <p className="agenda-card-extra">{a.dentist.name}</p>}
          {detail && <p className="agenda-card-detail">{detail}</p>}
        </div>
      </div>
    );
  }

  function renderDayHeader(arg: DayHeaderContentArg) {
    const weekday = arg.date.toLocaleDateString("es-CO", { weekday: "short", timeZone: "UTC" }).replace(".", "");
    if (arg.view.type === "dayGridMonth") return weekday;
    return (
      <span className="agenda-day">
        <span className="agenda-day-name">{weekday}</span>
        <span className={arg.isToday ? "agenda-day-number agenda-day-today" : "agenda-day-number"}>
          {arg.date.getUTCDate()}
        </span>
      </span>
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

      <div ref={panelRef} className="agenda-panel relative rounded-2xl border bg-card p-2 sm:p-4">
        <AgendaBackdrop />
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
          slotMinTime={toSlotTime(visibleHours.start)}
          slotMaxTime={toSlotTime(visibleHours.end)}
          slotDuration="00:15:00"
          slotLabelInterval="00:15"
          slotLabelFormat={{ hour: "numeric", minute: "2-digit", hour12: false }}
          slotLaneClassNames={slotClass}
          slotLabelClassNames={slotClass}
          eventDisplay="block"
          eventClassNames={eventClass}
          dragRevertDuration={220}
          eventDragStart={() => panelRef.current?.setAttribute("data-dragging", "")}
          eventDragStop={() => panelRef.current?.removeAttribute("data-dragging")}
          eventTimeFormat={{ hour: "numeric", minute: "2-digit", hour12: false }}
          slotEventOverlap={false}
          dayHeaderContent={renderDayHeader}
          allDaySlot={false}
          nowIndicator
          selectable
          selectMirror
          editable
          eventDurationEditable
          eventStartEditable
          businessHours={businessHours}
          eventSources={eventSources}
          eventsSet={syncBusyHours}
          datesSet={onDatesSet}
          select={onSelect}
          eventClick={onEventClick}
          eventDrop={onMoveOrResize}
          eventResize={onMoveOrResize}
          eventContent={renderEvent}
        />
        <div className="agenda-legend">
          <ul aria-label="Colores por tipo de cita">
            {(Object.keys(VISIT_TYPES) as VisitType[]).map((type) => (
              <li key={type} className={`agenda-type-${type}`}>
                <span className="agenda-legend-dot" aria-hidden="true" />
                {VISIT_TYPES[type]}
              </li>
            ))}
          </ul>
          <ul aria-label="Íconos por estado de la cita">
            {(Object.keys(STATUS_ICONS) as AppointmentStatus[]).map((status) => {
              const Icon = STATUS_ICONS[status];
              return (
                <li key={status}>
                  <Icon aria-hidden="true" />
                  {APPOINTMENT_STATUS[status]}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {draft && (
        <AppointmentFormDialog
          key={draft.mode === "edit" ? draft.appointment.id : `${draft.date}-${draft.time}`}
          draft={draft}
          professionals={professionals}
          sites={sites}
          presetPatient={patientForNext}
          onClose={() => setDraft(null)}
          onSaved={(saved) => {
            setDraft(null);
            setPatientForNext(null);
            // Se abre el detalle para enviar de una vez la invitación por WhatsApp.
            setModalOrigin(undefined);
            setSelected(saved);
            refetch();
          }}
        />
      )}

      {selected && (
        <AppointmentDetailsDialog
          key={selected.id + selected.status}
          appointment={selected}
          origin={modalOrigin}
          canWriteClinical={canWriteClinical}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setDraft({ mode: "edit", appointment: selected });
            setSelected(null);
          }}
          onChanged={(updated) => {
            setModalOrigin(undefined);
            setSelected(updated);
            refetch();
          }}
        />
      )}
    </div>
  );
}
