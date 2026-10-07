"use client";

import { useMemo, useState, useTransition } from "react";
import { MousePointer2, X } from "lucide-react";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { ODONTOGRAM_CONDITIONS, SURFACES, type OdontogramCondition, type OdontogramEntry, type ToothSurface } from "@/lib/types";
import { cn } from "@/lib/utils";
import { addMark, removeMark } from "./actions";
import { KIND_COLOR, ROWS, SURFACE_FILL, cariesIndices, isAnterior, surfaceAt, type Side } from "./teeth";

type Props = {
  patientId: string;
  initialEntries: OdontogramEntry[];
  readOnly: boolean;
};

// Geometría del dibujo (unidades del viewBox).
const BOX = 36; // lado del diente
const INNER = 10; // margen del cuadro central
const CELL = 44; // ancho por diente
const MIDLINE = 20; // separación entre lado derecho e izquierdo del paciente
const PAD = 8;
const ROW_H = 72;
const ARCH_GAP = 16; // separación entre arcada superior e inferior
const WIDTH = PAD * 2 + CELL * 16 + MIDLINE;

const POLYGONS: Record<Exclude<Side, "center">, string> = {
  top: `0,0 ${BOX},0 ${BOX - INNER},${INNER} ${INNER},${INNER}`,
  right: `${BOX},0 ${BOX},${BOX} ${BOX - INNER},${BOX - INNER} ${BOX - INNER},${INNER}`,
  bottom: `${INNER},${BOX - INNER} ${BOX - INNER},${BOX - INNER} ${BOX},${BOX} 0,${BOX}`,
  left: `0,0 ${INNER},${INNER} ${INNER},${BOX - INNER} 0,${BOX}`,
};

type Tool = OdontogramCondition | "SELECT";

export function Odontogram({ patientId, initialEntries, readOnly }: Props) {
  const [entries, setEntries] = useState(initialEntries);
  const [tool, setTool] = useState<Tool>("SELECT");
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const byTooth = useMemo(() => {
    const map = new Map<number, OdontogramEntry[]>();
    for (const e of entries) map.set(e.tooth, [...(map.get(e.tooth) ?? []), e]);
    return map;
  }, [entries]);
  const indices = useMemo(() => cariesIndices(entries), [entries]);

  /** El backend devuelve el estado vigente del diente: reemplaza solo ese diente. */
  function replaceTooth(tooth: number, toothEntries: OdontogramEntry[]) {
    setEntries((all) => [...all.filter((e) => e.tooth !== tooth), ...toothEntries]);
  }

  function apply(tooth: number, surface: ToothSurface | null) {
    if (readOnly || tool === "SELECT") return;
    const info = ODONTOGRAM_CONDITIONS[tool];
    setError(undefined);
    startTransition(async () => {
      const result = await addMark(patientId, { tooth, surface: info.surface ? surface : null, condition: tool });
      if (result.ok) replaceTooth(tooth, result.data);
      else setError(result.error);
    });
  }

  function remove(entry: OdontogramEntry) {
    setError(undefined);
    startTransition(async () => {
      const result = await removeMark(patientId, entry.id);
      if (result.ok) replaceTooth(entry.tooth, result.data);
      else setError(result.error);
    });
  }

  function onToothClick(tooth: number, side: Side) {
    setSelected(tooth);
    apply(tooth, surfaceAt(tooth, side));
  }

  const toolInfo = tool === "SELECT" ? null : ODONTOGRAM_CONDITIONS[tool];
  const selectedEntries = selected ? (byTooth.get(selected) ?? []) : [];

  return (
    <div className="grid gap-4">
      {!readOnly && (
        <Toolbar tool={tool} onChange={setTool} />
      )}
      <FormError message={error} />

      <div className="overflow-x-auto rounded-lg border bg-card p-2">
        <svg
          viewBox={`0 0 ${WIDTH} ${ROW_H * 4 + ARCH_GAP}`}
          className={cn("min-w-[640px] select-none", pending && "opacity-70")}
          role="group"
          aria-label="Odontograma"
        >
          <line x1={WIDTH / 2} x2={WIDTH / 2} y1={0} y2={ROW_H * 4 + ARCH_GAP} className="stroke-border" strokeDasharray="4 4" />
          <line x1={0} x2={WIDTH} y1={ROW_H * 2 + ARCH_GAP / 2} y2={ROW_H * 2 + ARCH_GAP / 2} className="stroke-border" strokeDasharray="4 4" />
          {ROWS.map((row, r) => {
            const y = r * ROW_H + (r >= 2 ? ARCH_GAP : 0);
            // Los temporales se alinean hacia la línea media.
            const offset = row.deciduous ? 3 : 0;
            return (
              <g key={r}>
                {row.left.map((tooth, i) => (
                  <Tooth
                    key={tooth}
                    tooth={tooth}
                    x={PAD + (i + offset) * CELL}
                    y={y}
                    entries={byTooth.get(tooth) ?? []}
                    selected={selected === tooth}
                    interactive={!pending}
                    onClick={onToothClick}
                  />
                ))}
                {row.right.map((tooth, i) => (
                  <Tooth
                    key={tooth}
                    tooth={tooth}
                    x={PAD + 8 * CELL + MIDLINE + i * CELL}
                    y={y}
                    entries={byTooth.get(tooth) ?? []}
                    selected={selected === tooth}
                    interactive={!pending}
                    onClick={onToothClick}
                  />
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
        <Card>
          <CardHeader>
            <CardTitle>{selected ? `Diente ${selected}` : "Selecciona un diente"}</CardTitle>
            <CardDescription>
              {selected
                ? readOnly
                  ? "Marcas en esta fecha."
                  : "Marcas vigentes. Quitar una la deja en el historial."
                : readOnly
                  ? "Toca un diente para ver sus marcas."
                  : "Elige una marca arriba y toca la superficie o el diente; o toca un diente para ver sus marcas."}
            </CardDescription>
          </CardHeader>
          {selected && (
            <CardContent className="grid gap-3">
              {selectedEntries.length === 0 && <p className="text-sm text-muted-foreground">Sin marcas.</p>}
              <ul className="grid gap-2">
                {selectedEntries.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-2 text-sm">
                    <div className="flex min-w-0 items-start gap-2">
                      <Swatch condition={e.condition} />
                      <div>
                        <p>
                          {ODONTOGRAM_CONDITIONS[e.condition].label}
                          {e.surface && <span className="text-muted-foreground"> · {surfaceLabel(selected, e.surface)}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {e.createdBy?.name ?? "—"} · {formatDateTime(e.createdAt)}
                        </p>
                      </div>
                    </div>
                    {!readOnly && (
                      <Button variant="ghost" size="icon-sm" aria-label="Quitar marca" disabled={pending} onClick={() => remove(e)}>
                        <X />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {/* Alternativa al clic en el dibujo (teclado y lectores de pantalla). */}
              {!readOnly && toolInfo && (
                <div className="grid gap-1.5 border-t pt-3">
                  <p className="text-xs text-muted-foreground">Aplicar «{toolInfo.label}» en:</p>
                  <div className="flex flex-wrap gap-1">
                    {toolInfo.surface ? (
                      (Object.keys(SURFACES) as ToothSurface[]).map((s) => (
                        <Button key={s} variant="outline" size="sm" disabled={pending} onClick={() => apply(selected, s)}>
                          {surfaceLabel(selected, s)}
                        </Button>
                      ))
                    ) : (
                      <Button variant="outline" size="sm" disabled={pending} onClick={() => apply(selected, null)}>
                        Diente completo
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Índices</CardTitle>
            <CardDescription>Calculados con el odontograma mostrado.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <Index
              name="COP-D"
              hint="Dientes permanentes: cariados, obturados y perdidos"
              parts={[["C", indices.cop.c], ["O", indices.cop.o], ["P", indices.cop.p]]}
            />
            <Index
              name="ceo-d"
              hint="Dientes temporales: cariados, con extracción indicada y obturados"
              parts={[["c", indices.ceo.c], ["e", indices.ceo.e], ["o", indices.ceo.o]]}
            />
          </CardContent>
        </Card>
      </div>

      <Legend />
    </div>
  );
}

function Tooth({
  tooth,
  x,
  y,
  entries,
  selected,
  interactive,
  onClick,
}: {
  tooth: number;
  x: number;
  y: number;
  entries: OdontogramEntry[];
  selected: boolean;
  interactive: boolean;
  onClick: (tooth: number, side: Side) => void;
}) {
  const bySurface = new Map(entries.filter((e) => e.surface).map((e) => [e.surface!, e.condition]));
  const whole = new Set(entries.filter((e) => !e.surface).map((e) => e.condition));
  const absent = whole.has("MISSING") || whole.has("UNERUPTED");
  const labels = entries
    .filter((e) => !e.surface && "short" in ODONTOGRAM_CONDITIONS[e.condition])
    .map((e) => {
      const info = ODONTOGRAM_CONDITIONS[e.condition] as { short: string; kind: keyof typeof KIND_COLOR };
      return { text: info.short, color: KIND_COLOR[info.kind], key: e.id };
    });
  const bx = (CELL - BOX) / 2;

  const surface = (side: Side) => {
    const s = surfaceAt(tooth, side);
    const condition = bySurface.get(s);
    const props = {
      fill: condition ? SURFACE_FILL[condition] : undefined,
      className: cn(
        "stroke-foreground/50",
        !condition && "fill-background",
        interactive && "cursor-pointer hover:opacity-80",
        interactive && !condition && "hover:fill-primary/20",
      ),
      strokeWidth: 1,
      onClick: () => interactive && onClick(tooth, side),
    };
    const title = <title>{`${tooth} ${surfaceLabel(tooth, s)}${condition ? `: ${ODONTOGRAM_CONDITIONS[condition].label}` : ""}`}</title>;
    return side === "center" ? (
      <rect key={side} x={INNER} y={INNER} width={BOX - INNER * 2} height={BOX - INNER * 2} {...props}>
        {title}
      </rect>
    ) : (
      <polygon key={side} points={POLYGONS[side]} {...props}>
        {title}
      </polygon>
    );
  };

  return (
    <g
      transform={`translate(${x} ${y})`}
      tabIndex={0}
      role="button"
      aria-label={`Diente ${tooth}`}
      aria-pressed={selected}
      className="outline-none [&:focus-visible>text:first-child]:fill-primary"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(tooth, "center");
        }
      }}
    >
      <text x={CELL / 2} y={10} textAnchor="middle" className={cn("text-[10px] tabular-nums", selected ? "fill-primary font-semibold" : "fill-muted-foreground")}>
        {tooth}
      </text>
      <g transform={`translate(${bx} 14)`} opacity={absent ? 0.35 : 1}>
        {selected && <rect x={-3} y={-3} width={BOX + 6} height={BOX + 6} rx={4} className="fill-none stroke-primary" strokeWidth={2} />}
        {(["top", "right", "bottom", "left", "center"] as Side[]).map(surface)}
      </g>
      <g transform={`translate(${bx} 14)`} pointerEvents="none">
        {whole.has("CROWN") && <circle cx={BOX / 2} cy={BOX / 2} r={BOX / 2 + 2} fill="none" stroke={KIND_COLOR.done} strokeWidth={2.5} />}
        {(whole.has("MISSING") || whole.has("EXTRACTION_INDICATED")) && (
          <g stroke={whole.has("MISSING") ? KIND_COLOR.done : KIND_COLOR.finding} strokeWidth={3} strokeLinecap="round">
            <line x1={2} y1={2} x2={BOX - 2} y2={BOX - 2} />
            <line x1={BOX - 2} y1={2} x2={2} y2={BOX - 2} />
          </g>
        )}
      </g>
      <text x={CELL / 2} y={64} textAnchor="middle" className="text-[9px] font-semibold" pointerEvents="none">
        {labels.map((l, i) => (
          <tspan key={l.key} fill={l.color}>
            {i > 0 ? " " : ""}
            {l.text}
          </tspan>
        ))}
      </text>
    </g>
  );
}

function surfaceLabel(tooth: number, surface: ToothSurface) {
  if (surface === "O") return isAnterior(tooth) ? "Incisal" : "Oclusal";
  if (surface === "L") return [1, 2, 5, 6].includes(Math.floor(tooth / 10)) ? "Palatino" : "Lingual";
  return SURFACES[surface];
}

function Toolbar({ tool, onChange }: { tool: Tool; onChange: (tool: Tool) => void }) {
  const conditions = Object.entries(ODONTOGRAM_CONDITIONS) as [OdontogramCondition, (typeof ODONTOGRAM_CONDITIONS)[OdontogramCondition]][];
  const item = (value: Tool, label: string, icon: React.ReactNode) => (
    <button
      key={value}
      type="button"
      aria-pressed={tool === value}
      onClick={() => onChange(value)}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors hover:bg-muted",
        tool === value && "border-primary bg-primary/10 font-medium text-primary hover:bg-primary/15",
      )}
    >
      {icon}
      {label}
    </button>
  );
  return (
    <div className="grid gap-2" role="toolbar" aria-label="Marcas del odontograma">
      <div className="flex flex-wrap items-center gap-1">
        {item("SELECT", "Seleccionar", <MousePointer2 className="size-3.5" />)}
        <span className="mx-1 text-xs text-muted-foreground">Superficie:</span>
        {conditions.filter(([, i]) => i.surface).map(([c, i]) => item(c, i.label, <Swatch condition={c} />))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-xs text-muted-foreground">Diente completo:</span>
        {conditions.filter(([, i]) => !i.surface).map(([c, i]) => item(c, i.label, <Swatch condition={c} />))}
      </div>
    </div>
  );
}

function Swatch({ condition }: { condition: OdontogramCondition }) {
  const info = ODONTOGRAM_CONDITIONS[condition];
  const fill = SURFACE_FILL[condition];
  const color = KIND_COLOR[info.kind];
  return (
    <svg viewBox="0 0 12 12" className="mt-0.5 size-3 shrink-0" aria-hidden>
      {fill ? (
        <rect width={12} height={12} rx={2} fill={fill} />
      ) : condition === "CROWN" ? (
        <circle cx={6} cy={6} r={4.5} fill="none" stroke={color} strokeWidth={2} />
      ) : condition === "MISSING" || condition === "EXTRACTION_INDICATED" ? (
        <path d="M2 2 10 10M10 2 2 10" stroke={color} strokeWidth={2} strokeLinecap="round" />
      ) : (
        <rect x={1} y={1} width={10} height={10} rx={2} fill="none" stroke={color} strokeWidth={2} />
      )}
    </svg>
  );
}

function Index({ name, hint, parts }: { name: string; hint: string; parts: [string, number][] }) {
  const total = parts.reduce((sum, [, n]) => sum + n, 0);
  return (
    <div title={hint}>
      <p className="flex items-baseline justify-between">
        <span className="font-medium">{name}</span>
        <span className="text-lg font-semibold tabular-nums">{total}</span>
      </p>
      <p className="text-xs text-muted-foreground tabular-nums">{parts.map(([k, n]) => `${k} ${n}`).join(" · ")}</p>
    </div>
  );
}

function Legend() {
  return (
    <p className="text-xs text-muted-foreground">
      <span style={{ color: KIND_COLOR.finding }}>Rojo</span>: hallazgo por tratar ·{" "}
      <span style={{ color: KIND_COLOR.done }}>Azul</span>: tratamiento realizado o existente · TC endodoncia · RR resto
      radicular · FX fractura · IMP implante · SE sin erupcionar
    </p>
  );
}
