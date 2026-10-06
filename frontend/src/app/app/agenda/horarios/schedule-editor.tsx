"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WEEKDAYS, type ScheduleBlock, type Site } from "@/lib/types";
import { saveSchedule } from "../actions";

type Row = { key: number; dayOfWeek: number; siteId: string; startTime: string; endTime: string };

type Props = { dentistId: string; sites: Site[]; initial: ScheduleBlock[] };

const selectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** Edita el horario semanal de un profesional; se guarda completo de una vez. */
export function ScheduleEditor({ dentistId, sites, initial }: Props) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((b, i) => ({
      key: i,
      dayOfWeek: b.dayOfWeek,
      siteId: b.siteId,
      startTime: b.startTime.slice(0, 5),
      endTime: b.endTime.slice(0, 5),
    })),
  );
  const [nextKey, setNextKey] = useState(initial.length);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [pending, startTransition] = useTransition();

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function addRow() {
    const last = rows.at(-1);
    setRows((rs) => [
      ...rs,
      {
        key: nextKey,
        dayOfWeek: last ? Math.min(last.dayOfWeek + 1, 7) : 1,
        siteId: last?.siteId ?? sites[0]?.id ?? "",
        startTime: last?.startTime ?? "08:00",
        endTime: last?.endTime ?? "12:00",
      },
    ]);
    setNextKey((k) => k + 1);
  }

  function save() {
    setMessage(undefined);
    startTransition(async () => {
      const result = await saveSchedule(
        dentistId,
        rows.map(({ dayOfWeek, siteId, startTime, endTime }) => ({ dayOfWeek, siteId, startTime, endTime })),
      );
      setMessage(result.ok ? { ok: true, text: "Horario guardado." } : { ok: false, text: result.error });
    });
  }

  return (
    <div className="grid gap-4">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Sin horario configurado: se puede agendar a cualquier hora. Agrega bloques para restringirlo.
        </p>
      ) : (
        <div className="grid gap-2">
          {rows
            .toSorted((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime))
            .map((r) => (
              <div key={r.key} className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Día"
                  className={selectClass}
                  value={r.dayOfWeek}
                  onChange={(e) => update(r.key, { dayOfWeek: Number(e.target.value) })}
                >
                  {Object.entries(WEEKDAYS).map(([d, name]) => (
                    <option key={d} value={d}>
                      {name}
                    </option>
                  ))}
                </select>
                <Input
                  aria-label="Desde"
                  type="time"
                  step={900}
                  className="w-28"
                  value={r.startTime}
                  onChange={(e) => update(r.key, { startTime: e.target.value })}
                />
                <span className="text-sm text-muted-foreground">a</span>
                <Input
                  aria-label="Hasta"
                  type="time"
                  step={900}
                  className="w-28"
                  value={r.endTime}
                  onChange={(e) => update(r.key, { endTime: e.target.value })}
                />
                {sites.length > 1 && (
                  <select
                    aria-label="Sede"
                    className={selectClass}
                    value={r.siteId}
                    onChange={(e) => update(r.key, { siteId: e.target.value })}
                  >
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Quitar bloque"
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
        </div>
      )}

      {message && (message.ok ? <p className="text-sm text-primary">{message.text}</p> : <FormError message={message.text} />)}

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={addRow}>
          <Plus /> Agregar bloque
        </Button>
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? "Guardando…" : "Guardar horario"}
        </Button>
      </div>
    </div>
  );
}
