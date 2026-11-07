"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { addDays, dayKey, dayLabel, timeLabel, todayKey, type BookingSlot } from "@/lib/booking";

type Load = (from: string) => Promise<{ ok: true; data: BookingSlot[] } | { ok: false; error: string }>;

/** Semana a semana: solo muestra horas libres. {@code load} cambia cuando cambia el profesional. */
export function SlotPicker({ load, onPick, disabled }: { load: Load; onPick: (slot: BookingSlot) => void; disabled?: boolean }) {
  const [from, setFrom] = useState(todayKey);
  const [result, setResult] = useState<{ key: unknown; from: string; slots?: BookingSlot[]; error?: string } | null>(null);

  useEffect(() => {
    let live = true;
    void load(from).then((r) => {
      if (live) setResult(r.ok ? { key: load, from, slots: r.data } : { key: load, from, error: r.error });
    });
    return () => {
      live = false;
    };
  }, [load, from]);

  const current = result && result.key === load && result.from === from ? result : null;
  const days = useMemo(() => {
    const map = new Map<string, BookingSlot[]>();
    for (const s of current?.slots ?? []) {
      const key = dayKey(s.startsAt);
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.values()];
  }, [current]);

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" disabled={from <= todayKey()} onClick={() => setFrom(addDays(from, -7))}>
          <ChevronLeft aria-hidden="true" />Anterior
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setFrom(addDays(from, 7))}>
          Siguiente<ChevronRight aria-hidden="true" />
        </Button>
      </div>
      {!current && <p role="status" className="text-sm text-muted-foreground">Buscando horas libres…</p>}
      {current?.error && <p role="alert" className="text-sm text-destructive">{current.error}</p>}
      {current?.slots && days.length === 0 && <p className="text-sm text-muted-foreground">No hay horas libres esta semana. Prueba con la siguiente.</p>}
      {days.map((slots) => (
        <section key={slots[0].startsAt} className="grid gap-2">
          <h3 className="text-sm font-medium first-letter:uppercase">{dayLabel(slots[0].startsAt)}</h3>
          <ul className="flex flex-wrap gap-2">
            {slots.map((s) => (
              <li key={`${s.startsAt}-${s.siteId}`}>
                <Button type="button" variant="outline" size="sm" disabled={disabled} title={s.siteName} onClick={() => onPick(s)}>
                  {timeLabel(s.startsAt)}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
