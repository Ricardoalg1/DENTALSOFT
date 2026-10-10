type Row = { key: string; label: string; detail?: string; value: number; display: string };

/**
 * Barras horizontales de una sola serie (magnitud por categoría). El valor va al final de cada fila
 * como texto, así que no depende del color ni de un tooltip.
 */
export function BarList({ rows, empty, variant = "bar" }: { rows: Row[]; empty: string; variant?: "bar" | "donut" }) {
  const colors = ["#6fc7df", "#6abf9d", "#9c7cea", "#f487b6", "#6aa9ee"];
  const total = rows.reduce((sum, row) => sum + Math.max(0, row.value), 0);
  if (variant === "donut") {
    let offset = 0;
    const stops = rows.map((row, index) => { const from = offset; offset += total ? Math.max(0,row.value) / total * 100 : 0; return `${colors[index % colors.length]} ${from}% ${offset}%`; });
    return <div className="flex flex-wrap items-center gap-6"><div aria-hidden="true" className="grid size-32 shrink-0 place-items-center rounded-full" style={{ background: total ? `conic-gradient(${stops.join(",")})` : "var(--muted)" }}><div className="size-20 rounded-full bg-card" /></div><div className="min-w-0 flex-1">{!total && <p className="mb-3 text-sm text-muted-foreground">{empty}</p>}<ul className="grid gap-2">{rows.map((row,index) => <li key={row.key} className="flex items-center gap-2 border-b pb-2 text-xs"><span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} /><span className="flex-1">{row.label}</span><span className="tabular-nums">{row.display}</span><span className="ml-2 text-muted-foreground">{total ? Math.round(row.value / total * 100) : 0}%</span></li>)}</ul></div></div>;
  }
  if (rows.length === 0) return <div className="grid min-h-36 place-content-center gap-4 text-center"><div className="flex h-16 items-end justify-center gap-5" aria-hidden="true">{[35,50,65,40].map((height,index) => <span key={index} className="w-4 rounded-t bg-muted" style={{ height }} />)}</div><p className="text-sm text-muted-foreground">{empty}</p></div>;
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
