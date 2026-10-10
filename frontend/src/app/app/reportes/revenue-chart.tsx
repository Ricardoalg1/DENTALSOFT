"use client";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

import { useMemo, useState } from "react";
import { formatCOP, formatDate } from "@/lib/format";
import { formatCOPCompact, niceTicks } from "./chart-format";

type Point = { date: string; total: number };

/** Más de ~2 meses de días deja barras de 1 px: se agrupa por semana (lunes a domingo). */
const MAX_BARS_BY_DAY = 62;

function byWeek(days: Point[]): Point[] {
  const weeks = new Map<string, number>();
  for (const d of days) {
    const date = new Date(`${d.date}T00:00:00Z`);
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    weeks.set(key, (weeks.get(key) ?? 0) + d.total);
  }
  return [...weeks].map(([date, total]) => ({ date, total }));
}

/**
 * Recaudo por día (o por semana): columnas de una sola serie. Cada columna es su propia zona de
 * hover/foco con tooltip; los mismos valores están en la tabla de abajo.
 */
export function RevenueChart({ days }: { days: Point[] }) {
  const weekly = days.length > MAX_BARS_BY_DAY;
  const points = useMemo(() => (weekly ? byWeek(days) : days), [days, weekly]);
  const max = Math.max(...points.map((p) => p.total), 0);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const [active, setActive] = useState<number | null>(null);

  const label = (p: Point) =>
    weekly ? `Semana del ${formatDate(p.date)}` : formatDate(p.date);
  // Etiquetas del eje X: todas si caben; si no, la primera, la del medio y la última.
  const showX = (i: number) =>
    points.length <= 16 ||
    i === 0 ||
    i === points.length - 1 ||
    i === Math.floor(points.length / 2);

  if (max === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Sin recaudo en el periodo.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex gap-2">
        {/* Eje Y */}
        <div
          className="relative h-48 w-16 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums"
          aria-hidden
        >
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 translate-y-1/2"
              style={{ bottom: `${(t / top) * 100}%` }}
            >
              {formatCOPCompact(t)}
            </span>
          ))}
        </div>
        <div className="relative h-48 min-w-0 flex-1">
          {/* Líneas guía: finas, sólidas y discretas */}
          {ticks.map((t) => (
            <span
              key={t}
              aria-hidden
              className="absolute inset-x-0 border-t border-border"
              style={{ bottom: `${(t / top) * 100}%` }}
            />
          ))}
          <ul
            className="absolute inset-0 flex items-end gap-0.5"
            aria-label={weekly ? "Recaudo por semana" : "Recaudo por día"}
          >
            {points.map((p, i) => (
              <li
                key={p.date}
                className="relative flex h-full min-w-0 flex-1 justify-center"
              >
                <button
                  type="button"
                  className="flex h-full w-full cursor-default items-end justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  aria-label={`${label(p)}: ${formatCOP(p.total)}`}
                  onPointerEnter={() => setActive(i)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                >
                  {p.total > 0 && (
                    <span
                      className="block w-full max-w-6 rounded-t-[4px] bg-chart-accent transition-opacity"
                      style={{
                        height: `max(2px, ${(p.total / top) * 100}%)`,
                        opacity: active === null || active === i ? 1 : 0.55,
                      }}
                    />
                  )}
                </button>
                {active === i && (
                  <div
                    role="tooltip"
                    className="pointer-events-none absolute bottom-full z-10 mb-2 grid min-w-max gap-0.5 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
                    style={{
                      left: "50%",
                      transform: `translateX(${i > points.length * 0.7 ? "-90%" : i < points.length * 0.3 ? "-10%" : "-50%"})`,
                    }}
                  >
                    <strong className="text-sm tabular-nums">
                      {formatCOP(p.total)}
                    </strong>
                    <span className="text-muted-foreground">{label(p)}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
      {/* Eje X */}
      <div
        className="ml-18 flex gap-0.5 text-[11px] text-muted-foreground"
        aria-hidden
      >
        {points.map((p, i) => (
          <span
            key={p.date}
            className="min-w-0 flex-1 text-center whitespace-nowrap"
          >
            {showX(i)
              ? weekly
                ? p.date.slice(5).split("-").reverse().join("/")
                : p.date.slice(8)
              : ""}
          </span>
        ))}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-primary">
          Ver como tabla
        </summary>
        <div className="max-h-72 overflow-y-auto pt-2">
          <Table className="w-full text-left">
            <TableHeader className="text-xs text-muted-foreground">
              <TableRow>
                <TableHead className="py-1 font-medium">
                  {weekly ? "Semana" : "Día"}
                </TableHead>
                <TableHead className="py-1 text-right font-medium">
                  Recaudo
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {points.map((p) => (
                <TableRow key={p.date} className="border-t">
                  <TableCell className="py-1">{label(p)}</TableCell>
                  <TableCell className="py-1 text-right tabular-nums">
                    {formatCOP(p.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </details>
    </div>
  );
}
