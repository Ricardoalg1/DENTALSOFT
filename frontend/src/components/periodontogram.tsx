"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  GM_MAX,
  GM_MIN,
  LOWER_QUADRANTS,
  PD_MAX,
  UPPER_QUADRANTS,
  WIDTH_MAX,
  emptySide,
  furcationSites,
  getTooth,
  pdDanger,
  perioStats,
  updateTooth,
  type Face,
} from "@/lib/periodontogram";
import { PERIO_PROGNOSES, type PerioPrognosis, type PerioSide, type PerioTooth } from "@/lib/types";
import { ART_W, CEJ_Y, FurcationMark, PerioArtDefs, PerioToothArt } from "./perio-tooth-art";

type Props = {
  teeth: PerioTooth[];
  /** Ausente en la vista de una evolución firmada (solo lectura). */
  onChange?: (teeth: PerioTooth[]) => void;
};

// Geometría (px).
const SITE_W = 24;
const TOOTH_W = SITE_W * 3;
const LABEL_W = 116;
const QUAD_GAP = 16;
const ROW_H = 26;
const DRAW_H = 150;
const ART_SCALE = 1.4;
const ART_X = (TOOTH_W - ART_W * ART_SCALE) / 2;
const ART_PAD = 5;
const MM = 5; // px por mm en la gráfica
const CHART_W = LABEL_W + TOOTH_W * 16 + QUAD_GAP + 16; // ancho natural de la tabla (con su relleno)
const MAX_ZOOM = 1.6;

/** Filas del periodontograma, en el orden del formato de SEPA. */
type SiteRow = "bop" | "suppuration" | "plaque" | "gm" | "pd";
type Item =
  | { kind: "number" | "implant" | "mobility" | "prognosis" | "width" | "note" }
  | { kind: "furcation" | "drawing"; face: Face }
  | { kind: SiteRow; face: Face };

const UPPER_LAYOUT: Item[] = [
  { kind: "number" },
  { kind: "implant" },
  { kind: "mobility" },
  { kind: "prognosis" },
  { kind: "furcation", face: "buccal" },
  { kind: "bop", face: "buccal" },
  { kind: "suppuration", face: "buccal" },
  { kind: "plaque", face: "buccal" },
  { kind: "width" },
  { kind: "gm", face: "buccal" },
  { kind: "pd", face: "buccal" },
  { kind: "drawing", face: "buccal" },
  { kind: "drawing", face: "lingual" },
  { kind: "pd", face: "lingual" },
  { kind: "gm", face: "lingual" },
  { kind: "plaque", face: "lingual" },
  { kind: "bop", face: "lingual" },
  { kind: "suppuration", face: "lingual" },
  { kind: "furcation", face: "lingual" },
  { kind: "note" },
];

const LOWER_LAYOUT: Item[] = [
  { kind: "note" },
  { kind: "furcation", face: "lingual" },
  { kind: "bop", face: "lingual" },
  { kind: "suppuration", face: "lingual" },
  { kind: "plaque", face: "lingual" },
  { kind: "gm", face: "lingual" },
  { kind: "pd", face: "lingual" },
  { kind: "drawing", face: "lingual" },
  { kind: "drawing", face: "buccal" },
  { kind: "pd", face: "buccal" },
  { kind: "gm", face: "buccal" },
  { kind: "width" },
  { kind: "plaque", face: "buccal" },
  { kind: "bop", face: "buccal" },
  { kind: "suppuration", face: "buccal" },
  { kind: "furcation", face: "buccal" },
  { kind: "prognosis" },
  { kind: "mobility" },
  { kind: "implant" },
  { kind: "number" },
];

const LABELS: Record<Item["kind"], string> = {
  number: "",
  implant: "Implante",
  mobility: "Movilidad",
  prognosis: "Pronóstico individual",
  furcation: "Furca",
  bop: "Sangrado",
  suppuration: "Supuración",
  plaque: "Placa",
  width: "Anchura encía",
  gm: "Margen gingival",
  pd: "Profundidad de sondaje",
  note: "Nota",
  drawing: "",
};

const faceLabel = (face: Face, upper: boolean) => (face === "buccal" ? "Vestibular" : upper ? "Palatino" : "Lingual");
const fmt = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 2 });
const toothLabel = (n: number) => `${Math.floor(n / 10)}.${n % 10}`;
const STRIPES = {
  backgroundImage: "repeating-linear-gradient(45deg, var(--muted) 0 3px, transparent 3px 6px)",
} as const;

type Ctx = {
  teeth: PerioTooth[];
  readOnly: boolean;
  defs: string;
  edit: (n: number, change: (t: PerioTooth) => PerioTooth) => void;
  editSide: (n: number, face: Face, change: (s: PerioSide) => PerioSide) => void;
  move: (from: HTMLInputElement, key: string) => void;
};

export function Periodontogram({ teeth, onChange }: Props) {
  const readOnly = !onChange;
  const root = useRef<HTMLDivElement>(null);
  const defs = useId().replace(/:/g, "");
  const stats = perioStats({ teeth });
  const frame = useRef<HTMLDivElement>(null);
  // Con espacio de sobra, la tabla se amplía para ocupar todo el ancho; en pantallas estrechas se desplaza.
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const fit = entry.contentRect.width / CHART_W;
      setZoom(Math.min(MAX_ZOOM, Math.max(1, Math.floor(fit * 100) / 100)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const edit = (n: number, change: (t: PerioTooth) => PerioTooth) => onChange?.(updateTooth(teeth, n, change));
  const editSide = (n: number, face: Face, change: (s: PerioSide) => PerioSide) =>
    edit(n, (t) => ({ ...t, [face]: change(t[face] ?? emptySide()) }));

  /**
   * Navegación con teclado entre casillas de margen y sondaje: ← → recorren la fila (saltando ausentes),
   * ↑ ↓ pasan a la casilla de la misma columna más cercana en la arcada, Enter avanza.
   */
  function move(from: HTMLInputElement, key: string) {
    const { arch, grid, col } = from.dataset;
    const c = Number(col);
    if (key === "ArrowUp" || key === "ArrowDown") {
      const top = from.getBoundingClientRect().top;
      const candidates = [...(root.current?.querySelectorAll<HTMLInputElement>(`[data-arch="${arch}"][data-col="${c}"]`) ?? [])]
        .map((el) => ({ el, dy: el.getBoundingClientRect().top - top }))
        .filter(({ dy }) => (key === "ArrowUp" ? dy < -1 : dy > 1))
        .sort((a, b) => Math.abs(a.dy) - Math.abs(b.dy));
      candidates[0]?.el.focus();
      return;
    }
    const step = key === "ArrowLeft" ? -1 : 1;
    for (let i = c + step; i >= 0 && i < 48; i += step) {
      const next = root.current?.querySelector<HTMLInputElement>(`[data-grid="${grid}"][data-col="${i}"]`);
      if (next) return void next.focus();
    }
  }

  const ctx: Ctx = { teeth, readOnly, defs, edit, editSide, move };

  return (
    <div className="grid gap-3" ref={root}>
      <PerioArtDefs id={defs} />
      <div ref={frame} className="overflow-x-auto rounded-lg border bg-card">
        <div style={{ width: CHART_W, zoom }} className="grid gap-8 px-2 py-4">
          <Arch title="SUPERIOR" arch="u" upper quadrants={UPPER_QUADRANTS} layout={UPPER_LAYOUT} ctx={ctx} />
          <Arch title="INFERIOR" arch="l" upper={false} quadrants={LOWER_QUADRANTS} layout={LOWER_LAYOUT} ctx={ctx} />
        </div>
      </div>

      <dl className="flex flex-wrap justify-center gap-x-8 gap-y-1 rounded-lg bg-muted/60 px-4 py-3 text-sm sm:text-base">
        <Stat label="Media de prof. de sondaje" value={`= ${fmt(stats.meanPd)} mm`} />
        <Stat label="Media de nivel de inserción" value={`= ${fmt(stats.meanCal)} mm`} />
        <Stat value={`${Math.round(stats.plaquePct)}%`} label="Placa" valueFirst />
        <Stat value={`${Math.round(stats.bopPct)}%`} label="Sangrado al sondaje" valueFirst />
      </dl>

      <details className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">Instrucciones</summary>
        <ul className="mt-2 grid list-disc gap-1 pl-5">
          <li>Clic en el número del diente para marcarlo ausente (se borran sus datos); otro clic lo recupera.</li>
          <li>Implante: clic en la casilla; el diente se dibuja como implante y no lleva furca.</li>
          <li>Movilidad 0–3: 0 &lt; 0,5 mm · 1 &lt; 1 mm · 2 entre 1 y 2 mm · 3 &gt; 2 mm o movilidad vertical.</li>
          <li className="flex flex-wrap items-center gap-1">
            Furca (sonda de Nabers), clics sucesivos:
            <FurcaIcon grade={1} /> inicial (&lt; 3 mm) · <FurcaIcon grade={2} /> abierta (3–5 mm) · <FurcaIcon grade={3} />
            completa (&gt; 5 mm o de lado a lado).
          </li>
          <li>Sangrado: grado 1, 2 o 3 con clics sucesivos. Supuración y placa: un clic activa, otro desactiva.</li>
          <li>Anchura de encía: de margen gingival a línea mucogingival por vestibular; de 0 a 2 mm se destaca en rojo.</li>
          <li>
            Margen gingival: distancia de la unión amelocementaria (LAC) al margen; negativo si está sobre la corona. Banda azul en la
            gráfica.
          </li>
          <li>
            Profundidad de sondaje: del margen al fondo de la bolsa. Banda roja; más de 3 mm (5 mm en implantes) se destaca en rojo.
          </li>
          <li>Nivel de inserción = margen gingival + profundidad de sondaje. Las medias cuentan los 6 sitios de cada diente presente.</li>
          {!readOnly && <li>Teclado: los dígitos avanzan solos; ← → ↑ ↓ y Enter navegan entre casillas.</li>}
        </ul>
      </details>
    </div>
  );
}

function Stat({ label, value, valueFirst }: { label: string; value: string; valueFirst?: boolean }) {
  return (
    <div className="flex gap-1.5">
      {valueFirst ? (
        <>
          <dd className="font-semibold tabular-nums">{value}</dd>
          <dt>{label}</dt>
        </>
      ) : (
        <>
          <dt>{label}</dt>
          <dd className="font-semibold tabular-nums">{value}</dd>
        </>
      )}
    </div>
  );
}

function FurcaIcon({ grade }: { grade: number }) {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden className="inline">
      <FurcationMark grade={grade} x={7} y={7} size={11} />
    </svg>
  );
}

function Arch({
  title,
  arch,
  upper,
  quadrants,
  layout,
  ctx,
}: {
  title: string;
  arch: string;
  upper: boolean;
  quadrants: readonly (readonly number[])[];
  layout: Item[];
  ctx: Ctx;
}) {
  return (
    <section aria-label={upper ? "Arcada superior" : "Arcada inferior"}>
      <h3 className="mb-3 text-center text-2xl font-light tracking-wide">{title}</h3>
      {layout.map((item, i) => (
        <div key={i} className="flex">
          <div
            style={{ width: LABEL_W, height: item.kind === "drawing" ? DRAW_H : ROW_H }}
            className={cn(
              "sticky left-0 z-10 flex shrink-0 items-center justify-end bg-card pr-2 text-right leading-tight",
              item.kind === "drawing" ? "justify-start pl-1 text-xl text-muted-foreground" : "text-xs",
            )}
          >
            {item.kind === "drawing" ? faceLabel(item.face, upper) : LABELS[item.kind]}
          </div>
          {quadrants.map((quadrant, q) => (
            <div
              key={q}
              style={{ marginLeft: q ? QUAD_GAP : 0 }}
              className={cn("flex shrink-0", item.kind !== "drawing" && "border-l border-border", i === 0 && "border-t")}
            >
              {quadrant.map((n, k) => (
                <Cell key={n} item={item} n={n} col={q * 24 + k * 3} arch={arch} upper={upper} ctx={ctx} />
              ))}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

function Cell({ item, n, col, arch, upper, ctx }: { item: Item; n: number; col: number; arch: string; upper: boolean; ctx: Ctx }) {
  const t = getTooth(ctx.teeth, n);
  const missing = !!t?.missing;
  const implant = !!t?.implant;

  if (item.kind === "drawing") {
    return <Drawing n={n} face={item.face} upper={upper} tooth={t} defs={ctx.defs} />;
  }

  const box = (children: React.ReactNode, className?: string) => (
    <div
      style={{ width: TOOTH_W, height: ROW_H, ...(missing && item.kind !== "number" ? STRIPES : {}) }}
      className={cn("flex shrink-0 border-r border-b border-border", className)}
    >
      {missing && item.kind !== "number" ? null : children}
    </div>
  );

  switch (item.kind) {
    case "number":
      return box(
        <button
          type="button"
          disabled={ctx.readOnly}
          aria-pressed={missing}
          aria-label={`Diente ${n}${missing ? " (ausente)" : ""}`}
          title={ctx.readOnly ? undefined : missing ? "Recuperar diente" : "Marcar ausente"}
          onClick={() => ctx.edit(n, (x) => (x.missing ? { tooth: n } : { tooth: n, missing: true }))}
          className={cn(
            "flex-1 text-base tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring",
            missing ? "bg-neutral-600 text-white" : "bg-sky-50 hover:bg-sky-200 dark:bg-sky-950/40 dark:hover:bg-sky-900",
          )}
        >
          {toothLabel(n)}
        </button>,
      );
    case "implant":
      return box(
        <button
          type="button"
          disabled={ctx.readOnly}
          aria-pressed={implant}
          aria-label={`Diente ${n}, implante`}
          onClick={() =>
            ctx.edit(n, (x) => ({
              ...x,
              implant: !x.implant,
              buccal: x.buccal && { ...x.buccal, furcation: [] },
              lingual: x.lingual && { ...x.lingual, furcation: [] },
            }))
          }
          className={cellButton}
        >
          {implant && <i className="mx-auto block size-2.5 rounded-full bg-[#6495ed]" />}
        </button>,
      );
    case "mobility":
      return box(
        <div className="m-auto">
          <NumberInput
            value={t?.mobility ?? null}
            min={0}
            max={3}
            label={`Diente ${n}, movilidad`}
            readOnly={ctx.readOnly}
            onChange={(v) => ctx.edit(n, (x) => ({ ...x, mobility: v }))}
          />
        </div>,
        "bg-muted/50",
      );
    case "width": {
      const width = t?.gingivalWidth ?? null;
      return box(
        <div className="m-auto">
          <NumberInput
            value={width}
            min={0}
            max={WIDTH_MAX}
            label={`Diente ${n}, anchura de encía`}
            readOnly={ctx.readOnly}
            className={width !== null && width < 3 ? "font-semibold text-red-600" : undefined}
            onChange={(v) => ctx.edit(n, (x) => ({ ...x, gingivalWidth: v }))}
          />
        </div>,
        "bg-muted/50",
      );
    }
    case "prognosis":
      return box(
        <select
          aria-label={`Diente ${n}, pronóstico individual`}
          value={t?.prognosis ?? ""}
          disabled={ctx.readOnly}
          onChange={(e) => ctx.edit(n, (x) => ({ ...x, prognosis: (e.target.value || null) as PerioPrognosis | null }))}
          className="w-full appearance-none bg-sky-50 text-center text-[11px] outline-none hover:bg-sky-200 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-100 dark:bg-sky-950/40"
        >
          <option value="" />
          {Object.entries(PERIO_PROGNOSES).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>,
      );
    case "note":
      return box(
        <input
          type="text"
          aria-label={`Diente ${n}, nota`}
          title={t?.note ?? undefined}
          maxLength={200}
          readOnly={ctx.readOnly}
          value={t?.note ?? ""}
          onChange={(e) => ctx.edit(n, (x) => ({ ...x, note: e.target.value }))}
          className="w-full min-w-0 bg-yellow-50 px-1 text-[11px] outline-none focus:relative focus:z-20 focus:w-56 focus:shadow-lg focus-visible:ring-2 focus-visible:ring-ring dark:bg-yellow-950/30"
        />,
      );
    case "furcation": {
      const sites = implant ? 0 : furcationSites(n, item.face);
      if (!sites) return box(null, "bg-muted");
      const values = t?.[item.face]?.furcation ?? [];
      return box(
        Array.from({ length: sites }, (_, k) => {
          const grade = values[k] ?? 0;
          return (
            <button
              key={k}
              type="button"
              disabled={ctx.readOnly}
              aria-label={`Diente ${n}, furca ${faceLabel(item.face, upper).toLowerCase()}${sites > 1 ? (k === 0 ? " izquierda" : " derecha") : ""}: grado ${grade}`}
              onClick={() =>
                ctx.editSide(n, item.face, (s) => {
                  const f = Array.from({ length: sites }, (_, i) => s.furcation?.[i] ?? 0);
                  f[k] = (f[k] + 1) % 4;
                  return { ...s, furcation: f };
                })
              }
              className={cn(cellButton, k > 0 && "border-l border-border")}
            >
              <svg width={16} height={16} viewBox="0 0 16 16" className="mx-auto" aria-hidden>
                <FurcationMark grade={grade} x={8} y={8} size={12} />
              </svg>
            </button>
          );
        }),
      );
    }
    case "bop":
    case "suppuration":
    case "plaque": {
      const side = t?.[item.face] ?? emptySide();
      const kind = item.kind;
      return box(
        [0, 1, 2].map((j) => {
          const value = kind === "bop" ? Number(side.bop[j]) || 0 : side[kind][j] ? 1 : 0;
          return (
            <button
              key={j}
              type="button"
              disabled={ctx.readOnly}
              aria-pressed={value > 0}
              aria-label={`Diente ${n} ${faceLabel(item.face, upper).toLowerCase()}, ${LABELS[kind].toLowerCase()}, sitio ${j + 1}${kind === "bop" ? `: grado ${value}` : ""}`}
              onClick={() =>
                ctx.editSide(n, item.face, (s) =>
                  kind === "bop"
                    ? { ...s, bop: s.bop.map((v, k) => (k === j ? ((Number(v) || 0) + 1) % 4 : Number(v) || 0)) }
                    : { ...s, [kind]: s[kind].map((v, k) => (k === j ? !v : v)) },
                )
              }
              className={cn(cellButton, "relative mx-px")}
            >
              <SiteMark kind={kind} value={value} />
            </button>
          );
        }),
      );
    }
    case "gm":
    case "pd": {
      const side = t?.[item.face] ?? emptySide();
      const kind = item.kind;
      return box(
        [0, 1, 2].map((j) => {
          const value = side[kind][j] ?? null;
          return (
            <div key={j} className="flex flex-1 items-center justify-center">
              <NumberInput
                value={value}
                min={kind === "gm" ? GM_MIN : 0}
                max={kind === "gm" ? GM_MAX : PD_MAX}
                label={`Diente ${n} ${faceLabel(item.face, upper).toLowerCase()}, ${LABELS[kind].toLowerCase()}, sitio ${j + 1}`}
                readOnly={ctx.readOnly}
                className={kind === "pd" && pdDanger(value, implant) ? "font-semibold text-red-600" : undefined}
                nav={{ arch, grid: `${arch}-${item.face}-${kind}`, col: col + j, move: ctx.move }}
                onChange={(v) => ctx.editSide(n, item.face, (s) => ({ ...s, [kind]: s[kind].map((x, k) => (k === j ? v : x)) }))}
              />
            </div>
          );
        }),
      );
    }
  }
}

const cellButton =
  "flex-1 bg-sky-50 outline-none hover:bg-sky-200 focus-visible:ring-2 focus-visible:ring-ring disabled:hover:bg-sky-50 dark:bg-sky-950/40 dark:hover:bg-sky-900 dark:disabled:hover:bg-sky-950/40";

/** Marcas de SEPA: sangrado punto / banda / lleno según el grado; supuración mitad inferior amarilla; placa azul. */
function SiteMark({ kind, value }: { kind: "bop" | "suppuration" | "plaque"; value: number }) {
  if (!value) return null;
  if (kind === "plaque") return <i className="absolute inset-0 bg-[#6495ed]" />;
  if (kind === "suppuration") return <i className="absolute inset-x-0 bottom-0 h-1/2 bg-amber-400" />;
  if (value === 1) return <i className="absolute top-1/2 left-1/2 size-2 -translate-1/2 rounded-full bg-red-600" />;
  if (value === 2) return <i className="absolute inset-x-0 top-[30%] h-[30%] bg-red-600" />;
  return <i className="absolute inset-0 bg-red-600" />;
}

/** Valor del texto escrito: null si está vacío o es solo "-", undefined si no es válido. */
function parseValue(text: string, min: number, max: number): number | null | undefined {
  if (text === "" || text === "-") return null;
  const v = Number(text);
  return Number.isInteger(v) && v >= min && v <= max ? v : undefined;
}

function NumberInput({
  value,
  min,
  max,
  label,
  readOnly,
  className,
  nav,
  onChange,
}: {
  value: number | null;
  min: number;
  max: number;
  label: string;
  readOnly: boolean;
  className?: string;
  /** Casillas de margen y sondaje: navegación con teclado y avance automático. */
  nav?: { arch: string; grid: string; col: number; move: (from: HTMLInputElement, key: string) => void };
  onChange: (v: number | null) => void;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  // El texto local solo manda mientras represente el valor; si el valor cambia desde fuera, gana el valor.
  const shown = parseValue(text, min, max) === value ? text : value === null ? "" : String(value);
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={label}
      autoComplete="off"
      placeholder="0"
      readOnly={readOnly}
      data-arch={nav?.arch}
      data-grid={nav?.grid}
      data-col={nav?.col}
      value={shown}
      onFocus={(e) => !readOnly && e.target.select()}
      onChange={(e) => {
        const raw = e.target.value;
        if (!(min < 0 ? /^-?\d{0,2}$/ : /^\d{0,2}$/).test(raw)) return;
        const v = parseValue(raw, min, max);
        if (v === undefined) return;
        setText(raw);
        onChange(v);
        const digits = raw.replace("-", "");
        // "1" puede seguir con otro dígito (10–15): se espera; el resto avanza solo.
        if (nav && digits && (digits.length === 2 || digits !== "1" || max < 10)) nav.move(e.target, "ArrowRight");
      }}
      onKeyDown={(e) => {
        if (!nav || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter"].includes(e.key)) return;
        e.preventDefault();
        nav.move(e.currentTarget, e.key);
      }}
      className={cn(
        "h-5 w-5 rounded-sm bg-yellow-50 text-center text-xs tabular-nums outline-none placeholder:text-foreground/70 focus:bg-background focus:ring-2 focus:ring-ring dark:bg-yellow-950/40",
        className,
      )}
    />
  );
}

/**
 * Dibujo del diente con su gráfica, como en SEPA: línea amelocementaria (roja), banda azul del margen gingival
 * y banda roja de la profundidad de sondaje, más los símbolos de furca sobre el diente.
 */
function Drawing({ n, face, upper, tooth, defs }: { n: number; face: Face; upper: boolean; tooth?: PerioTooth; defs: string }) {
  const missing = !!tooth?.missing;
  const implant = !!tooth?.implant;
  const side = missing ? null : tooth?.[face];
  // Arriba la raíz mira hacia arriba; abajo se voltea el dibujo.
  const cej = upper ? ART_PAD + CEJ_Y * ART_SCALE : DRAW_H - ART_PAD - CEJ_Y * ART_SCALE;
  const y = (mm: number) => Math.min(DRAW_H, Math.max(0, upper ? cej - mm * MM : cej + mm * MM));
  const xs = [0, 1, 2].map((j) => SITE_W * (j + 0.5));
  const gm = [0, 1, 2].map((j) => side?.gm[j] ?? 0);
  const floor = [0, 1, 2].map((j) => gm[j] + (side?.pd[j] ?? 0));
  const drawGraph = side && [...gm, ...floor].some((v) => v !== 0);
  const band = (a: number[], b: number[]) =>
    [...xs.map((x, j) => `${x},${y(a[j])}`), ...xs.map((x, j) => `${x},${y(b[j])}`).reverse()].join(" ");

  const furcation = implant || missing ? [] : (side?.furcation ?? []);
  const furcaY = upper ? ART_PAD + (CEJ_Y - 10) * ART_SCALE : DRAW_H - ART_PAD - (CEJ_Y - 10) * ART_SCALE;
  const furcaX = furcation.length === 2 ? [TOOTH_W / 2 - 13, TOOTH_W / 2 + 13] : [TOOTH_W / 2];

  return (
    <svg
      width={TOOTH_W}
      height={DRAW_H}
      className="shrink-0"
      role="img"
      aria-label={`Diente ${n}, ${faceLabel(face, upper).toLowerCase()}${missing ? ", ausente" : implant ? ", implante" : ""}`}
    >
      <g
        transform={
          upper
            ? `translate(${ART_X} ${ART_PAD}) scale(${ART_SCALE})`
            : `translate(${ART_X} ${DRAW_H - ART_PAD}) scale(${ART_SCALE} ${-ART_SCALE})`
        }
      >
        <PerioToothArt tooth={n} lingual={face === "lingual"} implant={implant} missing={missing} defs={defs} />
      </g>
      <line x1={0} x2={TOOTH_W} y1={cej} y2={cej} stroke="rgb(255,99,132)" strokeOpacity={0.45} strokeWidth={1.5} />
      {drawGraph && (
        <g>
          <polygon points={band(gm.map(() => 0), gm)} fill="rgba(100,149,237,0.4)" />
          <polygon points={band(gm, floor)} fill="rgba(255,99,132,0.4)" />
          <polyline points={xs.map((x, j) => `${x},${y(gm[j])}`).join(" ")} fill="none" stroke="rgb(100,149,237)" strokeWidth={2} />
          <polyline points={xs.map((x, j) => `${x},${y(floor[j])}`).join(" ")} fill="none" stroke="rgb(255,99,132)" strokeWidth={2} />
        </g>
      )}
      {furcation.map((grade, k) => (
        <FurcationMark key={k} grade={grade} x={furcaX[k] ?? TOOTH_W / 2} y={furcaY} size={11} />
      ))}
    </svg>
  );
}
