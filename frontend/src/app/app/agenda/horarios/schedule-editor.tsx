"use client";

import { useRef, useState, useTransition } from "react";
import { CalendarOff, Coffee, Plus, Trash2 } from "lucide-react";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WEEKDAYS, type ScheduleBlock, type Site, type TimeOff } from "@/lib/types";
import { cn } from "@/lib/utils";
import { saveSchedule, saveTimeOff } from "../actions";

/** Una franja que se repite en varios días de la semana (p. ej. lunes a viernes, 08:00 a 12:00). */
type Group = { key: number; days: number[]; siteId: string; start: string; end: string };
type Off = { key: number; from: string; to: string; allDay: boolean; start: string; end: string; reason: string };

type Props = { dentistId: string; sites: Site[]; initial: ScheduleBlock[]; initialTimeOff: TimeOff[] };

const selectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const SHORT: Record<number, string> = { 1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb", 7: "Dom" };
const PRESETS: [string, number[]][] = [
  ["Lunes a viernes", [1, 2, 3, 4, 5]],
  ["Fin de semana", [6, 7]],
  ["Todos los días", [1, 2, 3, 4, 5, 6, 7]],
];

const dayLabel = (days: number[]) => {
  const d = [...days].sort((a, b) => a - b);
  if (d.length === 7) return "Todos los días";
  if (d.length >= 3 && d.every((x, i) => i === 0 || x === d[i - 1] + 1)) return `${WEEKDAYS[d[0]]} a ${WEEKDAYS[d.at(-1)!]}`;
  return d.map((x) => WEEKDAYS[x]).join(", ");
};

/** Junta las franjas idénticas de distintos días en una sola. */
function normalize(groups: Group[]): Group[] {
  const map = new Map<string, Group>();
  for (const g of groups) {
    if (g.days.length === 0) continue;
    const k = `${g.siteId}|${g.start}|${g.end}`;
    const prev = map.get(k);
    if (prev) prev.days = [...new Set([...prev.days, ...g.days])].sort((a, b) => a - b);
    else map.set(k, { ...g, days: [...g.days].sort((a, b) => a - b) });
  }
  return [...map.values()].sort((a, b) => a.days[0] - b.days[0] || a.start.localeCompare(b.start));
}

/** Quita una franja (p. ej. el almuerzo) de los días indicados, partiendo los bloques que la contengan. */
function subtract(groups: Group[], days: number[], ex0: string, ex1: string, nextKey: () => number): Group[] {
  const out: Group[] = [];
  for (const g of groups) {
    const hit = g.days.filter((d) => days.includes(d));
    const rest = g.days.filter((d) => !days.includes(d));
    if (hit.length === 0) {
      out.push(g);
      continue;
    }
    if (rest.length) out.push({ ...g, days: rest });
    if (ex1 <= g.start || ex0 >= g.end) {
      out.push({ ...g, key: nextKey(), days: hit });
      continue;
    }
    if (ex0 > g.start) out.push({ ...g, key: nextKey(), days: hit, end: ex0 });
    if (ex1 < g.end) out.push({ ...g, key: nextKey(), days: hit, start: ex1 });
  }
  return normalize(out);
}

function DayChips({ days, onChange }: { days: number[]; onChange: (d: number[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Días de la semana">
      {Object.keys(WEEKDAYS)
        .map(Number)
        .map((d) => {
          const on = days.includes(d);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              title={WEEKDAYS[d]}
              onClick={() => onChange(on ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b))}
              className={cn(
                "h-8 min-w-11 rounded-lg border px-2 text-xs font-medium transition-colors",
                on ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-muted",
              )}
            >
              {SHORT[d]}
            </button>
          );
        })}
    </div>
  );
}

/** Edita el horario semanal de un profesional por franjas de varios días, descansos y días sin atención. */
export function ScheduleEditor({ dentistId, sites, initial, initialTimeOff }: Props) {
  const counter = useRef(1000);
  const nextKey = () => counter.current++;
  const defaultSite = sites[0]?.id ?? "";

  const [groups, setGroups] = useState<Group[]>(() =>
    normalize(
      initial.map((b, i) => ({ key: i, days: [b.dayOfWeek], siteId: b.siteId, start: b.startTime.slice(0, 5), end: b.endTime.slice(0, 5) })),
    ),
  );
  const [offs, setOffs] = useState<Off[]>(() =>
    initialTimeOff.map((t, i) => ({
      key: i,
      from: t.fromDate,
      to: t.toDate,
      allDay: t.startTime === null,
      start: t.startTime?.slice(0, 5) ?? "12:00",
      end: t.endTime?.slice(0, 5) ?? "14:00",
      reason: t.reason,
    })),
  );
  const [breakDays, setBreakDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const [breakStart, setBreakStart] = useState("12:00");
  const [breakEnd, setBreakEnd] = useState("14:00");
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [pending, startTransition] = useTransition();

  const patch = (key: number, p: Partial<Group>) => setGroups((gs) => gs.map((g) => (g.key === key ? { ...g, ...p } : g)));
  const patchOff = (key: number, p: Partial<Off>) => setOffs((os) => os.map((o) => (o.key === key ? { ...o, ...p } : o)));

  const addGroup = (days: number[]) =>
    setGroups((gs) => [...gs, { key: nextKey(), days, siteId: gs.at(-1)?.siteId ?? defaultSite, start: "08:00", end: "18:00" }]);

  function applyBreak() {
    setMessage(undefined);
    if (breakDays.length === 0) return setMessage({ ok: false, text: "Elige al menos un día para el descanso." });
    if (breakEnd <= breakStart) return setMessage({ ok: false, text: "La hora final del descanso debe ser posterior a la inicial." });
    setGroups((gs) => subtract(gs, breakDays, breakStart, breakEnd, nextKey));
    setMessage({ ok: true, text: `Descanso de ${breakStart} a ${breakEnd} descontado del horario (${dayLabel(breakDays).toLowerCase()}). Guarda para aplicarlo.` });
  }

  function save() {
    setMessage(undefined);
    for (const g of groups) {
      if (g.days.length === 0) return setMessage({ ok: false, text: "Cada franja necesita al menos un día." });
      if (g.end <= g.start) return setMessage({ ok: false, text: `La franja de ${dayLabel(g.days).toLowerCase()} termina antes de empezar.` });
    }
    for (const o of offs) {
      if (!o.from) return setMessage({ ok: false, text: "Cada día sin atención necesita una fecha." });
      if (o.to && o.to < o.from) return setMessage({ ok: false, text: "La fecha final no puede ser anterior a la inicial." });
      if (!o.allDay && o.end <= o.start) return setMessage({ ok: false, text: "La hora final de la ausencia debe ser posterior a la inicial." });
    }
    const blocks = groups.flatMap((g) => g.days.map((d) => ({ dayOfWeek: d, siteId: g.siteId, startTime: g.start, endTime: g.end })));
    startTransition(async () => {
      const a = await saveSchedule(dentistId, blocks);
      if (!a.ok) return setMessage({ ok: false, text: a.error });
      const b = await saveTimeOff(
        dentistId,
        offs.map((o) => ({
          fromDate: o.from,
          toDate: o.to || o.from,
          startTime: o.allDay ? null : o.start,
          endTime: o.allDay ? null : o.end,
          reason: o.reason,
        })),
      );
      setMessage(b.ok ? { ok: true, text: "Horario guardado." } : { ok: false, text: b.error });
    });
  }

  return (
    <div className="grid gap-6">
      {/* ---------- Franjas semanales ---------- */}
      <section className="grid gap-3">
        <h3 className="text-sm font-semibold">Horario semanal</h3>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin horario configurado: se puede agendar a cualquier hora. Agrega una franja para restringirlo.
          </p>
        ) : (
          <div className="grid gap-3">
            {groups.map((g) => (
              <div key={g.key} className="grid gap-2 rounded-xl border p-3">
                <DayChips days={g.days} onChange={(days) => patch(g.key, { days })} />
                <div className="flex flex-wrap items-center gap-2">
                  <Input aria-label="Desde" type="time" step={900} className="w-28" value={g.start} onChange={(e) => patch(g.key, { start: e.target.value })} />
                  <span className="text-sm text-muted-foreground">a</span>
                  <Input aria-label="Hasta" type="time" step={900} className="w-28" value={g.end} onChange={(e) => patch(g.key, { end: e.target.value })} />
                  {sites.length > 1 && (
                    <select aria-label="Sede" className={selectClass} value={g.siteId} onChange={(e) => patch(g.key, { siteId: e.target.value })}>
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">{g.days.length ? dayLabel(g.days) : "Sin días"}</span>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Quitar franja" onClick={() => setGroups((gs) => gs.filter((x) => x.key !== g.key))}>
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Agregar franja:</span>
          {PRESETS.map(([label, days]) => (
            <Button key={label} type="button" variant="outline" size="sm" onClick={() => addGroup(days)}>
              <Plus /> {label}
            </Button>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => addGroup([1])}>
            <Plus /> Un día
          </Button>
        </div>
      </section>

      {/* ---------- Descanso diario ---------- */}
      <section className="grid gap-3 rounded-xl border border-dashed p-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Coffee className="size-4" aria-hidden /> Descanso o franja sin atención
        </h3>
        <p className="text-sm text-muted-foreground">
          Descuenta una franja de las que ya tienes, por ejemplo el almuerzo de 12:00 a 14:00 todos los días. Las franjas que lo contengan se parten solas.
        </p>
        <DayChips days={breakDays} onChange={setBreakDays} />
        <div className="flex flex-wrap items-center gap-2">
          <Input aria-label="Descanso desde" type="time" step={900} className="w-28" value={breakStart} onChange={(e) => setBreakStart(e.target.value)} />
          <span className="text-sm text-muted-foreground">a</span>
          <Input aria-label="Descanso hasta" type="time" step={900} className="w-28" value={breakEnd} onChange={(e) => setBreakEnd(e.target.value)} />
          <Button type="button" variant="outline" size="sm" onClick={applyBreak} disabled={groups.length === 0}>
            Descontar del horario
          </Button>
        </div>
      </section>

      {/* ---------- Fechas específicas ---------- */}
      <section className="grid gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarOff className="size-4" aria-hidden /> Días específicos sin atención
        </h3>
        <p className="text-sm text-muted-foreground">
          Festivos, vacaciones o permisos: un día, un rango de fechas, o solo una franja de esos días. Bloquean las citas aunque el horario semanal las permita.
        </p>
        {offs.map((o) => (
          <div key={o.key} className="grid gap-2 rounded-xl border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Desde la fecha"
                type="date"
                className="w-40"
                value={o.from}
                onChange={(e) => patchOff(o.key, { from: e.target.value, to: o.to && o.to < e.target.value ? e.target.value : o.to })}
              />
              <span className="text-sm text-muted-foreground">hasta</span>
              <Input aria-label="Hasta la fecha (opcional)" type="date" className="w-40" min={o.from} value={o.to} onChange={(e) => patchOff(o.key, { to: e.target.value })} />
              <Button type="button" variant="ghost" size="icon-sm" className="ml-auto" aria-label="Quitar" onClick={() => setOffs((os) => os.filter((x) => x.key !== o.key))}>
                <Trash2 />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4" checked={o.allDay} onChange={(e) => patchOff(o.key, { allDay: e.target.checked })} /> Todo el día
              </label>
              {!o.allDay && (
                <>
                  <Input aria-label="Franja desde" type="time" step={900} className="w-28" value={o.start} onChange={(e) => patchOff(o.key, { start: e.target.value })} />
                  <span className="text-sm text-muted-foreground">a</span>
                  <Input aria-label="Franja hasta" type="time" step={900} className="w-28" value={o.end} onChange={(e) => patchOff(o.key, { end: e.target.value })} />
                </>
              )}
              <Input aria-label="Motivo" placeholder="Motivo (opcional)" maxLength={120} className="min-w-40 flex-1" value={o.reason} onChange={(e) => patchOff(o.key, { reason: e.target.value })} />
            </div>
          </div>
        ))}
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setOffs((os) => [...os, { key: nextKey(), from: "", to: "", allDay: true, start: "12:00", end: "14:00", reason: "" }])}>
            <Plus /> Agregar fecha
          </Button>
        </div>
      </section>

      {message && (message.ok ? <p className="text-sm text-primary">{message.text}</p> : <FormError message={message.text} />)}
      <div>
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? "Guardando…" : "Guardar horario"}
        </Button>
      </div>
    </div>
  );
}
