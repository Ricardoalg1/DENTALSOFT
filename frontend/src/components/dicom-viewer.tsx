"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Circle,
  Contrast,
  Download,
  DraftingCompass,
  Expand,
  FlipHorizontal2,
  FlipVertical2,
  Hand,
  Info,
  Layers,
  LoaderCircle,
  Maximize,
  Minus,
  MoveDiagonal,
  Pause,
  Play,
  Plus,
  RectangleHorizontal,
  RotateCcw,
  RotateCw,
  Ruler,
  Scale,
  Search,
  Spline,
  SunMedium,
  Trash2,
  Undo2,
  ZoomIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DicomImage } from "@/lib/dicom";
import type { DicomStack, LoadProgress, StackItem } from "@/lib/dicom-stack";
import {
  ANNOTATION_NAMES,
  COLORMAPS,
  CT_PRESETS,
  autoWindow,
  describe,
  labelAnchor,
  pixelValue,
  renderImage,
  type Annotation,
  type Colormap,
  type Point,
  type RenderOptions,
  type Spacing,
} from "@/lib/dicom-render";
import { cn } from "@/lib/utils";

type Tool = "window" | "pan" | "zoom" | "scroll" | "lens" | "line" | "angle" | "cobb" | "rect" | "ellipse" | "arrow" | "calibrate";
type View = { scale: number; x: number; y: number; rotation: 0 | 90 | 180 | 270; flipX: boolean; flipY: boolean };
type Shown = { id: string; image?: DicomImage; error?: string };
type Drag = { x: number; y: number; center: number; width: number; view: View; index: number };
type Editor = { kind: "note" | "calibrate"; at: Point; value: string; pixels?: number };

const TOOLS: { id: Tool; label: string; key: string; hint: string; icon: typeof Hand; group: 0 | 1 }[] = [
  { id: "window", label: "Brillo y contraste", key: "w", icon: SunMedium, group: 0, hint: "Arrastra: hacia arriba aclara, hacia abajo oscurece; a los lados cambia el contraste." },
  { id: "pan", label: "Mover", key: "m", icon: Hand, group: 0, hint: "Arrastra para mover la imagen." },
  { id: "zoom", label: "Zoom", key: "z", icon: ZoomIn, group: 0, hint: "Arrastra hacia arriba para acercar y hacia abajo para alejar. También Ctrl + rueda." },
  { id: "scroll", label: "Recorrer imágenes", key: "s", icon: Layers, group: 0, hint: "Arrastra hacia arriba o abajo para pasar las imágenes rápido." },
  { id: "lens", label: "Lupa", key: "l", icon: Search, group: 0, hint: "Mantén presionado sobre la imagen para ver ese punto ampliado." },
  { id: "line", label: "Distancia", key: "d", icon: Ruler, group: 1, hint: "Arrastra de un punto a otro para medir." },
  { id: "angle", label: "Ángulo", key: "a", icon: DraftingCompass, group: 1, hint: "Haz tres clics: un extremo, el vértice y el otro extremo." },
  { id: "cobb", label: "Ángulo entre rectas", key: "c", icon: Spline, group: 1, hint: "Traza una recta y luego otra: se mide el ángulo entre ambas (planos o ejes)." },
  { id: "rect", label: "Región rectangular", key: "r", icon: RectangleHorizontal, group: 1, hint: "Arrastra para marcar una región: área, valor medio, desviación, mínimo y máximo." },
  { id: "ellipse", label: "Región elíptica", key: "e", icon: Circle, group: 1, hint: "Arrastra para marcar una región elíptica: área y valores." },
  { id: "arrow", label: "Flecha con nota", key: "n", icon: MoveDiagonal, group: 1, hint: "Arrastra desde lo que quieres señalar hasta donde va el texto." },
  { id: "calibrate", label: "Calibrar", key: "k", icon: Scale, group: 1, hint: "Traza una línea sobre algo de tamaño conocido (regla, implante) y escribe su medida en mm." },
];

const COLOR = "#facc15";
const ACTIVE = "#fb923c";
const DEFAULT_VIEW: View = { scale: 1, x: 0, y: 0, rotation: 0, flipX: false, flipY: false };

function percent(p: LoadProgress) {
  return p.total > 0 ? Math.min(100, Math.round((p.done / p.total) * 100)) : null;
}

function fmt(n: number, digits = 0) {
  return n.toLocaleString("es-CO", { maximumFractionDigits: digits });
}

/** Miniatura JPEG de 96 px con la ventana del archivo. */
function thumbnail(img: DicomImage): string | null {
  const full = document.createElement("canvas");
  full.width = img.width;
  full.height = img.height;
  const ctx = full.getContext("2d");
  if (!ctx) return null;
  const data = ctx.createImageData(img.width, img.height);
  const options = { center: img.windowCenter, width: img.windowWidth, invert: img.inverted, gamma: 1, sharpen: 0, smooth: false, equalize: false, colormap: "gray" as const };
  renderImage(img, options, data.data);
  ctx.putImageData(data, 0, 0);
  const k = 96 / Math.max(img.width, img.height);
  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(img.width * k));
  small.height = Math.max(1, Math.round(img.height * k));
  small.getContext("2d")?.drawImage(full, 0, 0, small.width, small.height);
  return small.toDataURL("image/jpeg", 0.7);
}

const pause = () => new Promise((r) => setTimeout(r, 0));

function IconButton({ label, onClick, children, pressed }: { label: string; onClick: () => void; children: React.ReactNode; pressed?: boolean }) {
  return (
    <Button type="button" size="icon-sm" variant={pressed ? "default" : "outline"} aria-pressed={pressed} onClick={onClick} aria-label={label} title={label}>
      {children}
    </Button>
  );
}

/** Visor DICOM 2D: archivo suelto o serie en ZIP. Solo visualización y medición; no interpreta la imagen. */
export function DicomViewer({ src, title }: { src: string; title: string }) {
  const [stack, setStack] = useState<DicomStack>();
  const [progress, setProgress] = useState<LoadProgress>({ phase: "download", done: 0, total: 0 });
  const [error, setError] = useState<string>();
  const [seriesKey, setSeriesKey] = useState<string>();
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState<Shown>();
  const [win, setWin] = useState<{ center: number; width: number } | null>(null);
  const [invertToggle, setInvertToggle] = useState(false);
  const [gamma, setGamma] = useState(1);
  const [sharpen, setSharpen] = useState(0);
  const [smooth, setSmooth] = useState(false);
  const [equalize, setEqualize] = useState(false);
  const [colormap, setColormap] = useState<Colormap>("gray");
  const [tool, setTool] = useState<Tool>("window");
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [annotations, setAnnotations] = useState<Record<string, Annotation[]>>({});
  const [calibrations, setCalibrations] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<Annotation>();
  const [pending, setPending] = useState<Point[]>([]);
  const [editor, setEditor] = useState<Editor>();
  const [highlight, setHighlight] = useState<number>();
  const [overlay, setOverlay] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(10);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  /** Sube cada vez que la imagen base se vuelve a pintar, para redibujar la vista. */
  const [painted, setPainted] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  /** Puntero (coordenadas de imagen) y lupa (pantalla): no pasan por el estado para no re-renderizar en cada movimiento. */
  const hoverRef = useRef<Point | null>(null);
  const lensRef = useRef<Point | null>(null);
  const drawRef = useRef<() => void>(() => {});
  const frameRef = useRef(0);
  const wheelRef = useRef(0);
  const lastSize = useRef("");

  // Descarga y lectura: el archivo pasa por el BFF con la sesión; las imágenes nunca salen del navegador.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { DicomStack, download } = await import("@/lib/dicom-stack");
        const bytes = await download(src, (p) => !cancelled && setProgress(p));
        const loaded = await DicomStack.load(bytes, (p) => !cancelled && setProgress(p));
        if (cancelled) return;
        setStack(loaded);
        setSeriesKey(loaded.defaultSeries.key);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "No se pudo abrir la imagen.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src]);

  const series = stack?.series.find((s) => s.key === seriesKey);
  const items = useMemo(() => series?.items ?? [], [series]);
  const item: StackItem | undefined = items[Math.min(index, items.length - 1)];
  // Mientras llega la siguiente imagen se sigue viendo la anterior (sin parpadeo al recorrer).
  const image = shown?.image;
  const itemError = shown?.id === item?.id ? shown?.error : undefined;
  const itemAnnotations = useMemo(() => (item ? annotations[item.id] ?? [] : []), [annotations, item]);
  const calibration = item ? calibrations[item.id] : undefined;
  const spacing: Spacing = useMemo(() => (calibration ? [calibration, calibration] : image?.pixelSpacing ?? null), [calibration, image]);
  const center = win?.center ?? image?.windowCenter ?? 0;
  const width = win?.width ?? image?.windowWidth ?? 1;
  const invert = (image?.inverted ?? false) !== invertToggle;
  const options: RenderOptions = useMemo(
    () => ({ center, width, invert, gamma, sharpen, smooth, equalize, colormap }),
    [center, width, invert, gamma, sharpen, smooth, equalize, colormap],
  );

  // Imagen actual (de la caché si ya está) y precarga de las vecinas para recorrer sin esperas.
  useEffect(() => {
    if (!stack || !item) return;
    let cancelled = false;
    stack
      .image(item)
      .then((img) => !cancelled && setShown({ id: item.id, image: img }))
      .catch((e) => !cancelled && setShown({ id: item.id, error: e instanceof Error ? e.message : "No se pudo abrir esta imagen." }))
      .then(async () => {
        for (const step of [1, -1, 2, 3, -2, 4, 5, -3, 6, 8]) {
          const next = items[index + step];
          if (cancelled) return;
          if (!next) continue;
          await stack.image(next).catch(() => undefined);
          await pause();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [stack, item, items, index]);

  // Miniaturas para series cortas (sets de periapicales, pocas tomas): se generan de a una, sin bloquear.
  useEffect(() => {
    if (!stack || items.length < 2 || items.length > 80) return;
    let cancelled = false;
    (async () => {
      for (const it of items) {
        if (cancelled) return;
        try {
          const url = thumbnail(await stack.image(it));
          if (!cancelled && url) setThumbs((t) => (t[it.id] ? t : { ...t, [it.id]: url }));
        } catch {
          // Sin miniatura: el botón muestra el número.
        }
        await pause();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stack, items]);

  // Reproducción continua (cine).
  useEffect(() => {
    if (!playing || items.length < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % items.length), 1000 / fps);
    return () => clearInterval(timer);
  }, [playing, fps, items.length]);

  const fit = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap || !image) return;
    const rotated = view.rotation === 90 || view.rotation === 270;
    const w = rotated ? image.height : image.width;
    const h = rotated ? image.width : image.height;
    const scale = Math.min(wrap.clientWidth / w, wrap.clientHeight / h) * 0.96;
    setView((v) => ({ ...v, scale, x: 0, y: 0 }));
  }, [image, view.rotation]);

  // Ajustar a la pantalla al abrir y cuando cambia el tamaño de la imagen (series con tomas distintas).
  useEffect(() => {
    if (!image) return;
    const size = `${image.width}x${image.height}`;
    if (size !== lastSize.current) {
      lastSize.current = size;
      fit();
    }
  }, [image, fit]);

  // Imagen a resolución original con la ventana y el procesamiento actuales.
  useEffect(() => {
    if (!image) return;
    const frame = requestAnimationFrame(() => {
      const source = sourceRef.current ?? document.createElement("canvas");
      sourceRef.current = source;
      source.width = image.width;
      source.height = image.height;
      const ctx = source.getContext("2d");
      if (!ctx) return;
      const data = ctx.createImageData(image.width, image.height);
      renderImage(image, options, data.data);
      ctx.putImageData(data, 0, 0);
      setPainted((n) => n + 1);
    });
    return () => cancelAnimationFrame(frame);
  }, [image, options]);

  const toScreen = useCallback(
    (p: Point, cw: number, ch: number): Point => {
      if (!image) return p;
      const rad = (view.rotation * Math.PI) / 180;
      const x = (p.x - image.width / 2) * view.scale * (view.flipX ? -1 : 1);
      const y = (p.y - image.height / 2) * view.scale * (view.flipY ? -1 : 1);
      return { x: cw / 2 + view.x + x * Math.cos(rad) - y * Math.sin(rad), y: ch / 2 + view.y + x * Math.sin(rad) + y * Math.cos(rad) };
    },
    [image, view],
  );

  const toImage = useCallback(
    (sx: number, sy: number): Point => {
      const canvas = canvasRef.current;
      if (!image || !canvas) return { x: 0, y: 0 };
      const rad = (-view.rotation * Math.PI) / 180;
      const x = sx - canvas.clientWidth / 2 - view.x;
      const y = sy - canvas.clientHeight / 2 - view.y;
      return {
        x: ((x * Math.cos(rad) - y * Math.sin(rad)) / view.scale) * (view.flipX ? -1 : 1) + image.width / 2,
        y: ((x * Math.sin(rad) + y * Math.cos(rad)) / view.scale) * (view.flipY ? -1 : 1) + image.height / 2,
      };
    },
    [image, view],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const source = sourceRef.current;
    if (!canvas || !wrap || !source || !image) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = wrap.clientWidth;
    const ch = wrap.clientHeight;
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imageTransform = () => {
      ctx.translate(cw / 2 + view.x, ch / 2 + view.y);
      ctx.rotate((view.rotation * Math.PI) / 180);
      ctx.scale(view.scale * (view.flipX ? -1 : 1), view.scale * (view.flipY ? -1 : 1));
    };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cw, ch);
    if (itemError) return;
    ctx.save();
    imageTransform();
    ctx.imageSmoothingEnabled = view.scale < 2;
    ctx.drawImage(source, -image.width / 2, -image.height / 2);
    ctx.restore();

    const S = (p: Point) => toScreen(p, cw, ch);
    const label = (text: string, at: Point, color: string) => {
      ctx.font = "600 12px system-ui, sans-serif";
      const tw = ctx.measureText(text).width;
      const x = Math.min(cw - tw - 10, Math.max(4, at.x + 10));
      const y = Math.min(ch - 6, Math.max(18, at.y - 10));
      ctx.fillStyle = "rgba(0,0,0,.72)";
      ctx.fillRect(x - 4, y - 14, tw + 8, 19);
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    };
    const dot = (p: Point, color: string) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    };
    const segment = (a: Point, b: Point) => {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    };
    const shape = (ann: Annotation, color: string, withLabel: boolean) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      if (ann.kind === "rect" || ann.kind === "ellipse") {
        // El trazo se arma con la transformación de la imagen (sigue giros y volteos) y se pinta sin ella (grosor fijo).
        ctx.save();
        imageTransform();
        ctx.beginPath();
        const cx = (ann.a.x + ann.b.x) / 2 - image.width / 2;
        const cy = (ann.a.y + ann.b.y) / 2 - image.height / 2;
        const rx = Math.abs(ann.b.x - ann.a.x) / 2;
        const ry = Math.abs(ann.b.y - ann.a.y) / 2;
        if (ann.kind === "rect") ctx.rect(cx - rx, cy - ry, rx * 2, ry * 2);
        else ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.restore();
        ctx.stroke();
      } else if (ann.kind === "line") {
        segment(S(ann.a), S(ann.b));
        dot(S(ann.a), color);
        dot(S(ann.b), color);
      } else if (ann.kind === "angle") {
        const [a, b, c] = [S(ann.a), S(ann.b), S(ann.c)];
        segment(b, a);
        segment(b, c);
        const r = Math.min(28, Math.hypot(a.x - b.x, a.y - b.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2);
        const t1 = Math.atan2(a.y - b.y, a.x - b.x);
        let delta = Math.atan2(c.y - b.y, c.x - b.x) - t1;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, t1, t1 + delta, delta < 0);
        ctx.stroke();
        [a, b, c].forEach((p) => dot(p, color));
      } else if (ann.kind === "cobb") {
        segment(S(ann.a), S(ann.b));
        segment(S(ann.c), S(ann.d));
        [ann.a, ann.b, ann.c, ann.d].forEach((p) => dot(S(p), color));
      } else {
        const tip = S(ann.a);
        const tail = S(ann.b);
        segment(tail, tip);
        const t = Math.atan2(tip.y - tail.y, tip.x - tail.x);
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(tip.x - 12 * Math.cos(t - 0.4), tip.y - 12 * Math.sin(t - 0.4));
        ctx.lineTo(tip.x - 12 * Math.cos(t + 0.4), tip.y - 12 * Math.sin(t + 0.4));
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      }
      if (withLabel) label(describe(ann, image, spacing), S(labelAnchor(ann)), color);
    };

    itemAnnotations.forEach((ann, i) => shape(ann, i === highlight ? ACTIVE : COLOR, true));
    if (draft) shape(draft, COLOR, draft.kind !== "arrow");
    // Herramientas de varios pasos: vista previa hasta el puntero.
    const hover = hoverRef.current;
    if (tool === "angle" && pending.length > 0) {
      ctx.strokeStyle = COLOR;
      ctx.lineWidth = 2;
      const pts = hover ? [...pending, hover] : pending;
      for (let i = 1; i < pts.length; i++) segment(S(pts[i - 1]), S(pts[i]));
      pts.forEach((p) => dot(S(p), COLOR));
      if (pts.length === 3) label(describe({ kind: "angle", a: pts[0], b: pts[1], c: pts[2] }, image, spacing), S(pts[1]), COLOR);
    } else if (tool === "cobb" && pending.length === 2 && !draft) {
      shape({ kind: "line", a: pending[0], b: pending[1] }, COLOR, false);
    }

    // Lupa: un círculo con la imagen ampliada tres veces más que la vista.
    const lens = lensRef.current;
    if (lens) {
      const p = toImage(lens.x, lens.y);
      const radius = 90;
      ctx.save();
      ctx.beginPath();
      ctx.arc(lens.x, lens.y, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.translate(lens.x, lens.y);
      ctx.rotate((view.rotation * Math.PI) / 180);
      ctx.scale(view.scale * 3 * (view.flipX ? -1 : 1), view.scale * 3 * (view.flipY ? -1 : 1));
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(source, -p.x, -p.y);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(lens.x, lens.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,.85)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (!overlay) return;
    ctx.font = "500 12px system-ui, sans-serif";
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 3;
    ctx.fillStyle = "rgba(255,255,255,.9)";
    const lines = (texts: (string | null | false | undefined | 0)[], x: number, y: number, align: CanvasTextAlign, dir: 1 | -1) => {
      ctx.textAlign = align;
      texts.filter((t): t is string => typeof t === "string" && t.length > 0).forEach((t, i) => ctx.fillText(t, x, y + dir * i * 16));
      ctx.textAlign = "left";
    };
    const order = item?.order;
    lines(
      [
        series && series.items.length > 0 && stack && stack.series.length > 1 ? series.label : order?.seriesDescription,
        items.length > 1 && `Imagen ${index + 1} de ${items.length}`,
        items.length > 1 && order?.slicePosition != null && `Posición ${fmt(order.slicePosition, 1)} mm`,
        order?.sliceThickness != null && `Grosor ${fmt(order.sliceThickness, 2)} mm`,
      ],
      10,
      20,
      "left",
      1,
    );
    lines([`Zoom ${fmt(view.scale * 100)} %`, `Ventana C ${fmt(center)} · A ${fmt(width)}`], 10, ch - 10, "left", -1);
    const probe = hover ? pixelValue(image, hover.x, hover.y) : null;
    lines(
      [
        probe !== null && hover && `x ${Math.floor(hover.x)} · y ${Math.floor(hover.y)} · ${fmt(probe, 1)}${image.hounsfield ? " HU" : ""}`,
        calibration ? "Calibrada a mano" : !spacing && "Sin calibración: medidas en píxeles",
      ],
      cw - 10,
      ch - 10,
      "right",
      -1,
    );
    ctx.shadowBlur = 0;
  }, [image, itemError, view, toScreen, toImage, itemAnnotations, highlight, draft, pending, tool, spacing, calibration, overlay, item, series, stack, items.length, index, center, width]);

  useEffect(() => {
    drawRef.current = draw;
    draw();
  }, [draw, painted]);

  const requestDraw = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => drawRef.current());
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(() => drawRef.current());
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  const go = useCallback((i: number) => setIndex(Math.max(0, Math.min(items.length - 1, i))), [items.length]);

  const zoomAt = useCallback((factor: number, px = 0, py = 0) => {
    setView((v) => {
      const scale = Math.min(40, Math.max(0.05, v.scale * factor));
      const k = scale / v.scale;
      return { ...v, scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  }, []);

  // Rueda: recorre las imágenes de la serie; con Ctrl o ⌘ (o pellizco en el panel táctil) acerca o aleja.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (items.length > 1 && !e.ctrlKey && !e.metaKey) {
        // Ratón: una muesca (delta grande o en líneas) = una imagen. Panel táctil: deltas pequeños que se acumulan.
        const notch = e.deltaMode !== 0 || Math.abs(e.deltaY) >= 50;
        wheelRef.current = notch ? Math.sign(e.deltaY) * 30 : wheelRef.current + e.deltaY;
        const steps = Math.trunc(wheelRef.current / 30);
        if (steps !== 0) {
          wheelRef.current -= steps * 30;
          setPlaying(false);
          setIndex((i) => Math.max(0, Math.min(items.length - 1, i + steps)));
        }
        return;
      }
      const rect = canvas.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - rect.left - rect.width / 2, e.clientY - rect.top - rect.height / 2);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [items.length, zoomAt]);

  const addAnnotation = useCallback(
    (ann: Annotation) => {
      if (!item) return;
      setAnnotations((all) => ({ ...all, [item.id]: [...(all[item.id] ?? []), ann] }));
    },
    [item],
  );

  function pointerPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    return { screen, point: toImage(screen.x, screen.y) };
  }

  /** Posición del cuadro de texto junto al punto, sin salirse del visor. */
  function editorAt(p: Point): Point {
    const w = wrapRef.current?.clientWidth ?? 0;
    const h = wrapRef.current?.clientHeight ?? 0;
    const s = toScreen(p, w, h);
    return { x: Math.max(8, Math.min(s.x + 8, w - 232)), y: Math.max(8, Math.min(s.y + 8, h - 110)) };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!image || editor) return;
    wrapRef.current?.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    const { screen, point } = pointerPoint(e);
    drag.current = { x: e.clientX, y: e.clientY, center, width, view, index };
    if (tool === "lens") {
      lensRef.current = screen;
      requestDraw();
    } else if (tool === "line" || tool === "calibrate") {
      setDraft({ kind: "line", a: point, b: point });
    } else if (tool === "rect" || tool === "ellipse") {
      setDraft({ kind: tool, a: point, b: point });
    } else if (tool === "arrow") {
      setDraft({ kind: "arrow", a: point, b: point, text: "" });
    } else if (tool === "angle") {
      const pts = [...pending, point];
      if (pts.length === 3) {
        addAnnotation({ kind: "angle", a: pts[0], b: pts[1], c: pts[2] });
        setPending([]);
      } else {
        setPending(pts);
      }
    } else if (tool === "cobb") {
      setDraft(pending.length === 2 ? { kind: "cobb", a: pending[0], b: pending[1], c: point, d: point } : { kind: "line", a: point, b: point });
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const { screen, point } = pointerPoint(e);
    hoverRef.current = point;
    const d = drag.current;
    if (!d || !image) {
      requestDraw();
      return;
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (tool === "window") {
      const range = Math.max(1, image.max - image.min);
      // Arrastrar hacia arriba aclara (baja el centro de la ventana).
      setWin({ center: d.center + (dy * range) / 400, width: Math.max(1e-3, d.width + (dx * range) / 400) });
    } else if (tool === "pan") {
      setView({ ...d.view, x: d.view.x + dx, y: d.view.y + dy });
    } else if (tool === "zoom") {
      const scale = Math.min(40, Math.max(0.05, d.view.scale * Math.exp(-dy * 0.01)));
      setView({ ...d.view, scale, x: d.view.x * (scale / d.view.scale), y: d.view.y * (scale / d.view.scale) });
    } else if (tool === "scroll") {
      setPlaying(false);
      go(d.index + Math.round(dy / 6));
    } else if (tool === "lens") {
      lensRef.current = screen;
      requestDraw();
    } else if (draft?.kind === "cobb") {
      setDraft({ ...draft, d: point });
    } else if (draft && draft.kind !== "angle") {
      setDraft({ ...draft, b: point });
    } else {
      requestDraw();
    }
  }

  function onPointerUp() {
    drag.current = null;
    if (lensRef.current) {
      lensRef.current = null;
      requestDraw();
    }
    if (!draft || !item) return;
    setDraft(undefined);
    const size = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
    if (draft.kind === "cobb") {
      if (size(draft.c, draft.d) > 2) addAnnotation(draft);
      setPending([]);
      return;
    }
    if (draft.kind === "angle" || size(draft.a, draft.b) <= 2) return;
    if (tool === "cobb") {
      setPending([draft.a, draft.b]);
    } else if (tool === "calibrate") {
      setEditor({ kind: "calibrate", at: editorAt(draft.b), value: "", pixels: size(draft.a, draft.b) });
    } else if (draft.kind === "arrow") {
      addAnnotation(draft);
      setEditor({ kind: "note", at: editorAt(draft.b), value: "" });
    } else {
      addAnnotation(draft);
    }
  }

  function onPointerLeave() {
    hoverRef.current = null;
    requestDraw();
  }

  function saveEditor() {
    if (!editor || !item) return;
    if (editor.kind === "note") {
      const text = editor.value.trim().slice(0, 80);
      setAnnotations((all) => {
        const list = [...(all[item.id] ?? [])];
        const last = list.at(-1);
        if (last?.kind === "arrow") list[list.length - 1] = { ...last, text };
        return { ...all, [item.id]: list };
      });
    } else {
      const mm = Number.parseFloat(editor.value.replace(",", "."));
      const pixels = editor.pixels ?? 0;
      if (Number.isFinite(mm) && mm > 0 && pixels > 0) setCalibrations((c) => ({ ...c, [item.id]: mm / pixels }));
    }
    setEditor(undefined);
  }

  function undo() {
    if (!item) return;
    setAnnotations((all) => ({ ...all, [item.id]: (all[item.id] ?? []).slice(0, -1) }));
  }

  function removeAnnotation(i: number) {
    if (!item) return;
    setHighlight(undefined);
    setAnnotations((all) => ({ ...all, [item.id]: (all[item.id] ?? []).filter((_, j) => j !== i) }));
  }

  function removeCalibration() {
    if (!item) return;
    setCalibrations((c) => {
      const next = { ...c };
      delete next[item.id];
      return next;
    });
  }

  function chooseTool(t: Tool) {
    setTool(t);
    setPending([]);
    setDraft(undefined);
  }

  function reset() {
    setWin(null);
    setInvertToggle(false);
    setGamma(1);
    setSharpen(0);
    setSmooth(false);
    setEqualize(false);
    setColormap("gray");
    setView((v) => ({ ...v, rotation: 0, flipX: false, flipY: false }));
    requestAnimationFrame(fit);
  }

  function screenshot() {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${title}${items.length > 1 ? `-imagen-${index + 1}` : ""}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/png");
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (editor || e.altKey) return;
    const k = e.key;
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "z") {
      e.preventDefault();
      undo();
      return;
    }
    if (e.ctrlKey || e.metaKey) return;
    const moves: Record<string, number> = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1, PageUp: -10, PageDown: 10 };
    if (k in moves) {
      e.preventDefault();
      setPlaying(false);
      go(index + moves[k]);
    } else if (k === "Home" || k === "End") {
      e.preventDefault();
      go(k === "Home" ? 0 : items.length - 1);
    } else if (k === " " && items.length > 1) {
      e.preventDefault();
      setPlaying((p) => !p);
    } else if (k === "Escape") {
      setPending([]);
      setDraft(undefined);
    } else if (k.toLowerCase() === "i") {
      setInvertToggle((v) => !v);
    } else {
      const t = TOOLS.find((x) => x.key === k.toLowerCase());
      if (t) chooseTool(t.id);
    }
  }

  const rotate = (delta: 90 | -90) => setView((v) => ({ ...v, rotation: ((((v.rotation + delta) % 360) + 360) % 360) as View["rotation"] }));

  if (error) {
    return (
      <div className="grid gap-3 rounded-xl border p-6 text-sm">
        <p role="alert">{error}</p>
        <a href={src} download className="inline-flex w-fit items-center gap-2 text-primary hover:underline">
          <Download className="size-4" aria-hidden /> Descargar el archivo original
        </a>
      </div>
    );
  }

  const range = image ? Math.max(1, image.max - image.min) : 1;
  const activeTool = TOOLS.find((t) => t.id === tool)!;
  const loaded = percent(progress);
  const loadingText =
    progress.phase === "download" ? `Descargando${loaded !== null ? ` ${loaded} %` : "…"}` : `Leyendo imágenes: ${progress.done} de ${progress.total}`;

  const toolButton = (t: (typeof TOOLS)[number]) => (
    <Button
      key={t.id}
      type="button"
      size="icon-sm"
      variant={tool === t.id ? "default" : "outline"}
      aria-pressed={tool === t.id}
      aria-label={t.label}
      title={`${t.label} (${t.key.toUpperCase()})`}
      onClick={() => chooseTool(t.id)}
    >
      <t.icon />
    </Button>
  );
  const divider = <span className="mx-0.5 h-6 w-px bg-border" aria-hidden />;

  return (
    <div ref={rootRef} className="grid gap-3 [&:fullscreen]:overflow-auto [&:fullscreen]:bg-background [&:fullscreen]:p-3">
      <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Herramientas del visor">
        {TOOLS.filter((t) => t.group === 0 && (t.id !== "scroll" || items.length > 1)).map(toolButton)}
        {divider}
        {TOOLS.filter((t) => t.group === 1).map(toolButton)}
        {divider}
        <IconButton label="Acercar" onClick={() => zoomAt(1.25)}><Plus /></IconButton>
        <IconButton label="Alejar" onClick={() => zoomAt(0.8)}><Minus /></IconButton>
        <IconButton label="Ajustar a la pantalla" onClick={() => fit()}><Maximize /></IconButton>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="px-2 text-xs"
          onClick={() => setView((v) => ({ ...v, scale: 1, x: 0, y: 0 }))}
          title="Tamaño real: 1 píxel de la imagen = 1 píxel de la pantalla"
        >
          1:1
        </Button>
        <IconButton label="Girar a la izquierda" onClick={() => rotate(-90)}><RotateCcw /></IconButton>
        <IconButton label="Girar a la derecha" onClick={() => rotate(90)}><RotateCw /></IconButton>
        <IconButton label="Voltear horizontal" onClick={() => setView((v) => ({ ...v, flipX: !v.flipX }))} pressed={view.flipX}><FlipHorizontal2 /></IconButton>
        <IconButton label="Voltear vertical" onClick={() => setView((v) => ({ ...v, flipY: !v.flipY }))} pressed={view.flipY}><FlipVertical2 /></IconButton>
        <IconButton label="Invertir (I)" onClick={() => setInvertToggle((v) => !v)} pressed={invertToggle}><Contrast /></IconButton>
        {divider}
        <IconButton label="Deshacer la última medida (Ctrl+Z)" onClick={undo}><Undo2 /></IconButton>
        <IconButton label="Datos sobre la imagen" onClick={() => setOverlay((v) => !v)} pressed={overlay}><Info /></IconButton>
        <IconButton label="Guardar captura (PNG)" onClick={screenshot}><Camera /></IconButton>
        <IconButton label="Pantalla completa" onClick={toggleFullscreen}><Expand /></IconButton>
        <Button type="button" size="sm" variant="ghost" onClick={reset}>
          Restablecer
        </Button>
        <a href={src} download className="ml-auto inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
          <Download className="size-4" aria-hidden /> Original
        </a>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="grid min-w-0 content-start gap-2">
          <div
            ref={wrapRef}
            tabIndex={0}
            onKeyDown={onKeyDown}
            aria-label="Visor: flechas para cambiar de imagen, letras para elegir herramienta"
            className="relative h-[70svh] min-h-80 overflow-hidden rounded-xl bg-black outline-none focus-visible:ring-2 focus-visible:ring-ring in-[:fullscreen]:h-[calc(100svh-9rem)]"
          >
            {!image && !itemError && (
              <div role="status" className="absolute inset-0 grid place-items-center text-sm text-white/80">
                <div className="grid justify-items-center gap-2">
                  <span className="flex items-center gap-2">
                    <LoaderCircle className="size-4 animate-spin" aria-hidden /> {stack ? "Abriendo la imagen…" : loadingText}
                  </span>
                  {!stack && loaded !== null && (
                    <span className="h-1 w-48 overflow-hidden rounded-full bg-white/20">
                      <span className="block h-full bg-white/80" style={{ width: `${loaded}%` }} />
                    </span>
                  )}
                </div>
              </div>
            )}
            {itemError && (
              <p role="alert" className="absolute inset-0 z-10 grid place-items-center px-6 text-center text-sm text-white/85">
                {itemError}
              </p>
            )}
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={`Radiografía: ${title}${items.length > 1 ? `, imagen ${index + 1} de ${items.length}` : ""}`}
              className={cn(
                "absolute inset-0 size-full touch-none",
                tool === "pan" ? "cursor-grab" : tool === "scroll" || tool === "zoom" ? "cursor-ns-resize" : "cursor-crosshair",
              )}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={onPointerLeave}
            />
            {editor && (
              <form
                className="absolute z-20 grid w-56 gap-2 rounded-lg border bg-background p-2 text-sm shadow-lg"
                style={{ left: editor.at.x, top: editor.at.y }}
                onSubmit={(e) => {
                  e.preventDefault();
                  saveEditor();
                }}
              >
                <label className="grid gap-1">
                  <span className="text-xs text-muted-foreground">{editor.kind === "note" ? "Texto de la nota" : "Medida real de la línea (mm)"}</span>
                  <input
                    autoFocus
                    className="h-8 rounded-md border bg-transparent px-2"
                    inputMode={editor.kind === "calibrate" ? "decimal" : "text"}
                    maxLength={80}
                    value={editor.value}
                    onChange={(e) => setEditor({ ...editor, value: e.target.value })}
                    onKeyDown={(e) => e.key === "Escape" && setEditor(undefined)}
                  />
                </label>
                <div className="flex gap-2">
                  <Button type="submit" size="sm">
                    {editor.kind === "note" ? "Guardar" : "Calibrar"}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditor(undefined)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            )}
          </div>

          {items.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <IconButton label="Imagen anterior (↑)" onClick={() => go(index - 1)}><ChevronLeft /></IconButton>
              <IconButton label={playing ? "Pausar (espacio)" : "Reproducir (espacio)"} onClick={() => setPlaying((p) => !p)} pressed={playing}>{playing ? <Pause /> : <Play />}</IconButton>
              <IconButton label="Imagen siguiente (↓)" onClick={() => go(index + 1)}><ChevronRight /></IconButton>
              <input
                type="range"
                aria-label="Imagen de la serie"
                className="min-w-40 flex-1 accent-primary"
                min={0}
                max={items.length - 1}
                value={index}
                onChange={(e) => {
                  setPlaying(false);
                  go(Number(e.target.value));
                }}
              />
              <span className="tabular-nums text-muted-foreground">
                {index + 1} / {items.length}
              </span>
              <select
                aria-label="Velocidad de reproducción"
                className="h-8 rounded-md border bg-transparent px-1.5 text-xs"
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
              >
                {[2, 5, 10, 15, 20, 30].map((f) => (
                  <option key={f} value={f}>
                    {f} img/s
                  </option>
                ))}
              </select>
            </div>
          )}

          {stack && stack.series.length > 1 && (
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Serie</span>
              <select
                className="h-8 min-w-0 flex-1 rounded-md border bg-transparent px-2"
                value={seriesKey}
                onChange={(e) => {
                  setPlaying(false);
                  setSeriesKey(e.target.value);
                  setIndex(0);
                }}
              >
                {stack.series.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label} ({s.items.length})
                  </option>
                ))}
              </select>
            </label>
          )}

          {items.length > 1 && items.length <= 80 && (
            <ol className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Miniaturas">
              {items.map((it, i) => (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPlaying(false);
                      go(i);
                    }}
                    aria-label={`Imagen ${i + 1}`}
                    aria-current={i === index}
                    className={cn(
                      "grid size-16 shrink-0 place-items-center overflow-hidden rounded-md border bg-black text-xs text-white/70",
                      i === index ? "ring-2 ring-primary" : "opacity-75 hover:opacity-100",
                    )}
                  >
                    {thumbs[it.id] ? (
                      // eslint-disable-next-line @next/next/no-img-element -- miniatura generada en el navegador
                      <img src={thumbs[it.id]} alt="" className="max-h-full max-w-full" />
                    ) : (
                      i + 1
                    )}
                  </button>
                </li>
              ))}
            </ol>
          )}

          <p className="text-xs text-muted-foreground">
            {activeTool.hint}
            {tool === "angle" && pending.length > 0 && ` Llevas ${pending.length} de 3 puntos.`}
            {tool === "cobb" && pending.length === 2 && " Ahora traza la segunda recta."}
            {items.length > 1 && " Rueda del ratón o flechas: cambiar de imagen. Espacio: reproducir."}
          </p>
          {stack && stack.unreadable > 0 && (
            <p className="text-xs text-muted-foreground">
              {stack.unreadable === 1 ? "1 archivo del ZIP no se pudo leer" : `${stack.unreadable} archivos del ZIP no se pudieron leer`} (no traen
              imagen o están dañados).
            </p>
          )}
        </div>

        {image && (
          <aside className="grid content-start gap-5 text-sm">
            <section className="grid gap-3" aria-label="Ajustes de imagen">
              <h3 className="font-medium">Ajustes de imagen</h3>
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">Ventana</span>
                <select
                  className="h-8 rounded-md border bg-transparent px-2"
                  value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "file") setWin(null);
                    else if (v === "auto") setWin(autoWindow(image));
                    else {
                      const preset = CT_PRESETS.find((p) => p.label === v);
                      if (preset) setWin({ center: preset.center, width: preset.width });
                    }
                  }}
                >
                  <option value="" disabled>
                    Elegir…
                  </option>
                  <option value="file">La del archivo</option>
                  <option value="auto">Automática (según la imagen)</option>
                  {image.hounsfield &&
                    CT_PRESETS.map((p) => (
                      <option key={p.label} value={p.label}>
                        {p.label} (C {p.center} · A {p.width})
                      </option>
                    ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">Brillo</span>
                <input
                  type="range"
                  className="accent-primary"
                  // El centro de la ventana sube = imagen más oscura; el control va al revés para que a la derecha aclare.
                  min={-(image.max + range / 2)}
                  max={-(image.min - range / 2)}
                  step={range / 500}
                  value={-center}
                  onChange={(e) => setWin({ center: -Number(e.target.value), width })}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">Contraste (menos ancho = más contraste)</span>
                <input
                  type="range"
                  className="accent-primary"
                  min={range / 500}
                  max={range * 2}
                  step={range / 500}
                  value={width}
                  onChange={(e) => setWin({ center, width: Number(e.target.value) })}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">Tonos medios (gamma {fmt(gamma, 2)})</span>
                <input type="range" className="accent-primary" min={0.3} max={3} step={0.05} value={gamma} onChange={(e) => setGamma(Number(e.target.value))} />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">Nitidez (realce de bordes)</span>
                <input type="range" className="accent-primary" min={0} max={3} step={0.1} value={sharpen} onChange={(e) => setSharpen(Number(e.target.value))} />
              </label>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="accent-primary" checked={smooth} onChange={(e) => setSmooth(e.target.checked)} /> Suavizar ruido
                </label>
                {image.values && (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="accent-primary" checked={equalize} onChange={(e) => setEqualize(e.target.checked)} /> Ecualizar
                  </label>
                )}
              </div>
              {image.values && (
                <label className="grid gap-1">
                  <span className="text-xs text-muted-foreground">Colores</span>
                  <select className="h-8 rounded-md border bg-transparent px-2" value={colormap} onChange={(e) => setColormap(e.target.value as Colormap)}>
                    {Object.entries(COLORMAPS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </section>

            <section className="grid gap-2" aria-label="Medidas">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-medium">Medidas de esta imagen</h3>
                {itemAnnotations.length > 0 && (
                  <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => item && setAnnotations((a) => ({ ...a, [item.id]: [] }))}>
                    Borrar todas
                  </Button>
                )}
              </div>
              {itemAnnotations.length === 0 ? (
                <p className="text-xs text-muted-foreground">Elige una herramienta de medición en la barra superior.</p>
              ) : (
                <ul className="grid gap-1">
                  {itemAnnotations.map((ann, i) => (
                    <li
                      key={i}
                      className={cn("flex items-start gap-2 rounded-md px-2 py-1", i === highlight && "bg-muted")}
                      onMouseEnter={() => setHighlight(i)}
                      onMouseLeave={() => setHighlight(undefined)}
                    >
                      <span className="grid flex-1 gap-0.5">
                        <span className="text-xs text-muted-foreground">{ANNOTATION_NAMES[ann.kind]}</span>
                        <span className="text-xs tabular-nums">{describe(ann, image, spacing)}</span>
                      </span>
                      <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Quitar la medida" onClick={() => removeAnnotation(i)}>
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {calibration && (
                <p className="text-xs text-muted-foreground">
                  Calibrada a mano: {fmt(calibration, 4)} mm por píxel.{" "}
                  <button type="button" className="text-primary hover:underline" onClick={removeCalibration}>
                    Quitar calibración
                  </button>
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {spacing
                  ? "Las medidas son aproximadas: dependen de la calibración y de la magnificación de la toma."
                  : "El archivo no trae calibración: las medidas están en píxeles. Usa «Calibrar» con un objeto de tamaño conocido."}
              </p>
            </section>

            <section className="grid gap-2" aria-label="Datos del estudio">
              <h3 className="font-medium">Datos del estudio</h3>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                {[
                  ["Paciente en el archivo", image.info.patientName],
                  ["Fecha del estudio", image.info.studyDate],
                  ["Modalidad", image.info.modality],
                  ["Descripción", image.info.description],
                  ["Región", image.info.bodyPart],
                  ["Equipo", image.info.manufacturer],
                  ["Tamaño", `${image.width} × ${image.height} px`],
                  ["Píxel", image.pixelSpacing ? `${image.pixelSpacing[1]} × ${image.pixelSpacing[0]} mm` : "Sin calibración"],
                  ["Compresión", image.info.compression],
                  ["Cuadros", image.info.frames > 1 ? String(image.info.frames) : null],
                ]
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="wrap-break-word">{v}</dd>
                    </div>
                  ))}
              </dl>
            </section>
          </aside>
        )}
      </div>
    </div>
  );
}
