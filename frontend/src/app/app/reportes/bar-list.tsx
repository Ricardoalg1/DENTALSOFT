type Row = { key: string; label: string; detail?: string; value: number; display: string };

/**
 * Barras horizontales de una sola serie (magnitud por categoría). El valor va al final de cada fila
 * como texto, así que no depende del color ni de un tooltip.
 */
export function BarList({ rows, empty }: { rows: Row[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  return (
    <ul className="grid gap-3">
      {rows.map((r) => (
        <li key={r.key} className="grid gap-1 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate" title={r.label}>
              {r.label}
              {r.detail && <span className="text-muted-foreground"> · {r.detail}</span>}
            </span>
            <span className="shrink-0 font-medium tabular-nums">{r.display}</span>
          </div>
          <div className="h-2.5 w-full" aria-hidden>
            <div className="h-full rounded-r-[4px] bg-chart-accent" style={{ width: `max(2px, ${(r.value / max) * 100}%)` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
