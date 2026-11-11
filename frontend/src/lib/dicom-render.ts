/**
 * Procesamiento de la imagen para verla mejor y mediciones sobre ella. Solo cambia cómo se ve: los valores
 * originales del archivo no se modifican y no hay interpretación ni detección de hallazgos.
 */
import type { DicomImage } from "./dicom";

export type Colormap = "gray" | "hot" | "bone" | "jet";

export type RenderOptions = {
  center: number;
  width: number;
  invert: boolean;
  /** 1 = sin cambio; mayor aclara los tonos medios, menor los oscurece. */
  gamma: number;
  /** 0 = sin realce; hasta 3 = realce fuerte de bordes (máscara de enfoque). */
  sharpen: number;
  smooth: boolean;
  equalize: boolean;
  colormap: Colormap;
};

export const COLORMAPS: Record<Colormap, string> = { gray: "Grises", hot: "Calor", bone: "Hueso", jet: "Arcoíris" };

function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

const LUTS = new Map<Colormap, Uint8Array>();

function colormapLut(map: Colormap): Uint8Array {
  const known = LUTS.get(map);
  if (known) return known;
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let r = t;
    let g = t;
    let b = t;
    if (map === "hot") {
      r = clamp01(t * 3);
      g = clamp01(t * 3 - 1);
      b = clamp01(t * 3 - 2);
    } else if (map === "bone") {
      // Grises con un tinte azulado en las sombras (como el mapa «bone» clásico).
      r = (7 * t + clamp01(t * 3 - 2)) / 8;
      g = (7 * t + clamp01(t * 3 - 1)) / 8;
      b = (7 * t + clamp01(t * 3)) / 8;
    } else if (map === "jet") {
      r = clamp01(1.5 - Math.abs(4 * t - 3));
      g = clamp01(1.5 - Math.abs(4 * t - 2));
      b = clamp01(1.5 - Math.abs(4 * t - 1));
    }
    lut[i * 3] = Math.round(r * 255);
    lut[i * 3 + 1] = Math.round(g * 255);
    lut[i * 3 + 2] = Math.round(b * 255);
  }
  LUTS.set(map, lut);
  return lut;
}

/** Desenfoque 3×3 (1-2-1) de un canal. */
function blur3(src: Uint8ClampedArray, w: number, h: number, out: Uint8ClampedArray) {
  for (let y = 0; y < h; y++) {
    const y0 = y > 0 ? y - 1 : y;
    const y1 = y < h - 1 ? y + 1 : y;
    for (let x = 0; x < w; x++) {
      const x0 = x > 0 ? x - 1 : x;
      const x1 = x < w - 1 ? x + 1 : x;
      const r0 = y0 * w;
      const r1 = y * w;
      const r2 = y1 * w;
      out[r1 + x] =
        (src[r0 + x0] + 2 * src[r0 + x] + src[r0 + x1] +
          2 * src[r1 + x0] + 4 * src[r1 + x] + 2 * src[r1 + x1] +
          src[r2 + x0] + 2 * src[r2 + x] + src[r2 + x1]) / 16;
    }
  }
}

let scratch = new Uint8ClampedArray(0);

function channelPipeline(ch: Uint8ClampedArray, w: number, h: number, o: RenderOptions) {
  if (o.equalize) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < ch.length; i++) hist[ch[i]]++;
    const map = new Uint8Array(256);
    let acc = 0;
    let first = 0;
    while (first < 255 && hist[first] === 0) first++;
    const base = hist[first];
    const span = Math.max(1, ch.length - base);
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      map[v] = v <= first ? 0 : Math.round(((acc - base) / span) * 255);
    }
    for (let i = 0; i < ch.length; i++) ch[i] = map[ch[i]];
  }
  if (o.smooth || o.sharpen > 0) {
    if (scratch.length < ch.length) scratch = new Uint8ClampedArray(ch.length);
    const blurred = scratch.subarray(0, ch.length);
    blur3(ch, w, h, blurred);
    if (o.smooth) ch.set(blurred);
    if (o.sharpen > 0) {
      // Máscara de enfoque: original + cantidad × (original − desenfocada).
      if (o.smooth) blur3(ch, w, h, blurred);
      for (let i = 0; i < ch.length; i++) ch[i] = ch[i] + o.sharpen * (ch[i] - blurred[i]);
    }
  }
  if (o.gamma !== 1 || o.invert) {
    const lut = new Uint8Array(256);
    for (let v = 0; v < 256; v++) {
      const g = o.gamma === 1 ? v : 255 * Math.pow(v / 255, 1 / o.gamma);
      lut[v] = o.invert ? 255 - g : g;
    }
    for (let i = 0; i < ch.length; i++) ch[i] = lut[ch[i]];
  }
}

/** Pinta la imagen con la ventana y el procesamiento indicados. */
export function renderImage(image: DicomImage, o: RenderOptions, out: Uint8ClampedArray) {
  const { width: w, height: h } = image;
  const count = w * h;
  const low = o.center - o.width / 2;
  const scale = 255 / Math.max(1e-6, o.width);
  if (image.values) {
    const values = image.values;
    const gray = new Uint8ClampedArray(count);
    for (let i = 0; i < count; i++) gray[i] = (values[i] - low) * scale;
    channelPipeline(gray, w, h, o);
    const lut = o.colormap === "gray" ? null : colormapLut(o.colormap);
    for (let i = 0, j = 0; i < count; i++, j += 4) {
      const g = gray[i];
      if (lut) {
        out[j] = lut[g * 3];
        out[j + 1] = lut[g * 3 + 1];
        out[j + 2] = lut[g * 3 + 2];
      } else {
        out[j] = g;
        out[j + 1] = g;
        out[j + 2] = g;
      }
      out[j + 3] = 255;
    }
    return;
  }
  // Color: la ventana actúa como niveles sobre cada canal; sin ecualizar ni mapa de color.
  const rgba = image.rgba!;
  const ch = new Uint8ClampedArray(count);
  const opts = { ...o, equalize: false };
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < count; i++) ch[i] = (rgba[i * 4 + c] - low) * scale;
    channelPipeline(ch, w, h, opts);
    for (let i = 0; i < count; i++) out[i * 4 + c] = ch[i];
  }
  for (let i = 0; i < count; i++) out[i * 4 + 3] = 255;
}

/** Ventana automática que descarta el 1 % de valores extremos de cada lado. */
export function autoWindow(image: DicomImage): { center: number; width: number } {
  const values = image.values;
  if (!values) return { center: 128, width: 256 };
  const bins = 4096;
  const range = Math.max(1e-6, image.max - image.min);
  const hist = new Uint32Array(bins);
  const step = Math.max(1, Math.floor(values.length / 500_000));
  let n = 0;
  for (let i = 0; i < values.length; i += step) {
    hist[Math.min(bins - 1, Math.floor(((values[i] - image.min) / range) * bins))]++;
    n++;
  }
  const at = (fraction: number) => {
    let acc = 0;
    for (let b = 0; b < bins; b++) {
      acc += hist[b];
      if (acc >= fraction * n) return image.min + (b / bins) * range;
    }
    return image.max;
  };
  const lo = at(0.01);
  const hi = Math.max(lo + 1e-3, at(0.99));
  return { center: (lo + hi) / 2, width: hi - lo };
}

/** Ventanas habituales de tomografía (en unidades Hounsfield). */
export const CT_PRESETS = [
  { label: "Hueso", center: 500, width: 2000 },
  { label: "Tejido blando", center: 40, width: 400 },
  { label: "Pulmón", center: -600, width: 1500 },
  { label: "Cerebro", center: 40, width: 80 },
] as const;

// ---------- Mediciones ----------

export type Point = { x: number; y: number };

export type Annotation =
  | { kind: "line"; a: Point; b: Point }
  | { kind: "angle"; a: Point; b: Point; c: Point }
  | { kind: "cobb"; a: Point; b: Point; c: Point; d: Point }
  | { kind: "rect"; a: Point; b: Point }
  | { kind: "ellipse"; a: Point; b: Point }
  /** Flecha: la punta está en «a» (lo que se señala) y el texto junto a «b». */
  | { kind: "arrow"; a: Point; b: Point; text: string };

/** Milímetros por píxel [fila, columna]; null = sin calibración (se mide en píxeles). */
export type Spacing = [number, number] | null;

export function length(a: Point, b: Point, s: Spacing) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return s ? Math.hypot(dx * s[1], dy * s[0]) : Math.hypot(dx, dy);
}

function angleAt(vertex: Point, p: Point, q: Point, s: Spacing) {
  const sx = s ? s[1] : 1;
  const sy = s ? s[0] : 1;
  const a1 = Math.atan2((p.y - vertex.y) * sy, (p.x - vertex.x) * sx);
  const a2 = Math.atan2((q.y - vertex.y) * sy, (q.x - vertex.x) * sx);
  let d = Math.abs(a1 - a2) * (180 / Math.PI);
  if (d > 180) d = 360 - d;
  return d;
}

/** Ángulo agudo entre dos rectas (p. ej. planos cefalométricos o ejes de dientes). */
function angleBetween(a: Point, b: Point, c: Point, d: Point, s: Spacing) {
  const sx = s ? s[1] : 1;
  const sy = s ? s[0] : 1;
  const t1 = Math.atan2((b.y - a.y) * sy, (b.x - a.x) * sx);
  const t2 = Math.atan2((d.y - c.y) * sy, (d.x - c.x) * sx);
  let deg = Math.abs(t1 - t2) * (180 / Math.PI) % 180;
  if (deg > 90) deg = 180 - deg;
  return deg;
}

export type RegionStats = { mean: number; sd: number; min: number; max: number; area: number; pixels: number };

/** Estadísticas de los valores originales dentro de un rectángulo o elipse. */
export function regionStats(image: DicomImage, ann: Extract<Annotation, { kind: "rect" | "ellipse" }>, s: Spacing): RegionStats | null {
  // Cuentan los píxeles cuyo centro (x + 0,5) cae dentro de la región.
  const x0 = Math.max(0, Math.ceil(Math.min(ann.a.x, ann.b.x) - 0.5));
  const x1 = Math.min(image.width - 1, Math.floor(Math.max(ann.a.x, ann.b.x) - 0.5));
  const y0 = Math.max(0, Math.ceil(Math.min(ann.a.y, ann.b.y) - 0.5));
  const y1 = Math.min(image.height - 1, Math.floor(Math.max(ann.a.y, ann.b.y) - 0.5));
  const cx = (ann.a.x + ann.b.x) / 2;
  const cy = (ann.a.y + ann.b.y) / 2;
  const rx = Math.abs(ann.b.x - ann.a.x) / 2;
  const ry = Math.abs(ann.b.y - ann.a.y) / 2;
  let n = 0;
  let sum = 0;
  let sum2 = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (ann.kind === "ellipse") {
        const dx = (x + 0.5 - cx) / Math.max(rx, 1e-6);
        const dy = (y + 0.5 - cy) / Math.max(ry, 1e-6);
        if (dx * dx + dy * dy > 1) continue;
      }
      const v = pixelValue(image, x, y);
      if (v === null) continue;
      n++;
      sum += v;
      sum2 += v * v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (n === 0) return null;
  const mean = sum / n;
  const area = n * (s ? s[0] * s[1] : 1);
  return { mean, sd: Math.sqrt(Math.max(0, sum2 / n - mean * mean)), min, max, area, pixels: n };
}

/** Valor original en un píxel (luminancia si es a color). */
export function pixelValue(image: DicomImage, x: number, y: number): number | null {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  if (xi < 0 || yi < 0 || xi >= image.width || yi >= image.height) return null;
  const i = yi * image.width + xi;
  if (image.values) return image.values[i];
  const rgba = image.rgba!;
  return 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
}

function fmt(n: number, digits = 1) {
  return n.toLocaleString("es-CO", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/** Texto de la medida para mostrar junto al dibujo y en la lista. */
export function describe(ann: Annotation, image: DicomImage, s: Spacing): string {
  const unit = s ? "mm" : "px";
  switch (ann.kind) {
    case "line":
      return `${fmt(length(ann.a, ann.b, s), s ? 1 : 0)} ${unit}`;
    case "angle":
      return `${fmt(angleAt(ann.b, ann.a, ann.c, s))}°`;
    case "cobb":
      return `${fmt(angleBetween(ann.a, ann.b, ann.c, ann.d, s))}° entre rectas`;
    case "rect":
    case "ellipse": {
      const st = regionStats(image, ann, s);
      if (!st) return "Fuera de la imagen";
      const vu = image.hounsfield ? " HU" : "";
      const area = `${fmt(st.area, s ? 1 : 0)} ${unit}²`;
      return `${area} · media ${fmt(st.mean)}${vu} ± ${fmt(st.sd)} · mín ${fmt(st.min, 0)} · máx ${fmt(st.max, 0)}`;
    }
    case "arrow":
      return ann.text || "Nota";
  }
}

export const ANNOTATION_NAMES: Record<Annotation["kind"], string> = {
  line: "Distancia",
  angle: "Ángulo",
  cobb: "Ángulo entre rectas",
  rect: "Rectángulo",
  ellipse: "Elipse",
  arrow: "Nota",
};

/** Punto donde se escribe la etiqueta de la medida (coordenadas de imagen). */
export function labelAnchor(ann: Annotation): Point {
  switch (ann.kind) {
    case "line":
      return { x: (ann.a.x + ann.b.x) / 2, y: (ann.a.y + ann.b.y) / 2 };
    case "angle":
      return ann.b;
    case "cobb":
      return { x: (ann.a.x + ann.b.x + ann.c.x + ann.d.x) / 4, y: (ann.a.y + ann.b.y + ann.c.y + ann.d.y) / 4 };
    case "rect":
    case "ellipse":
      return { x: Math.max(ann.a.x, ann.b.x), y: Math.min(ann.a.y, ann.b.y) };
    case "arrow":
      return ann.b;
  }
}
