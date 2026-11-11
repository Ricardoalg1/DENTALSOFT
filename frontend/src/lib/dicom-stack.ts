/**
 * Series DICOM en el navegador: un archivo suelto (con uno o varios cuadros) o un ZIP con muchas imágenes.
 *
 * El ZIP no se descomprime entero en memoria: se lee su índice, cada imagen se infla cuando hace falta y
 * las ya decodificadas se guardan en una caché con tope de memoria. Así una tomografía de cientos de
 * cortes se recorre con fluidez sin agotar la memoria del equipo.
 */
import { inflateSync } from "fflate";
import { DicomError, openDicom, type DicomFile, type DicomImage, type DicomOrder } from "./dicom";

export type StackItem = {
  id: string;
  /** Archivo dentro del ZIP (o 0 si es un archivo suelto). */
  source: number;
  frame: number;
  order: DicomOrder;
  name: string;
};

export type Series = { key: string; label: string; items: StackItem[] };

export type LoadProgress = { phase: "download" | "read"; done: number; total: number };

type ZipEntry = { name: string; method: number; offset: number; compressedSize: number; size: number };

const CACHE_BUDGET = 384 * 1024 * 1024;

function u16(b: Uint8Array, i: number) {
  return b[i] | (b[i + 1] << 8);
}

function u32(b: Uint8Array, i: number) {
  return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
}

/** Índice central del ZIP (los ZIP que guarda Occlus siempre lo tienen completo). */
function readZipIndex(b: Uint8Array): ZipEntry[] {
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (u32(b, i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new DicomError("El ZIP está dañado: no se encontró su índice.");
  const count = u16(b, end + 10);
  let p = u32(b, end + 16);
  if (count === 0xffff || p === 0xffffffff) throw new DicomError("El ZIP es demasiado grande para abrirlo en el navegador.");
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (u32(b, p) !== 0x02014b50) throw new DicomError("El ZIP está dañado.");
    const nameLength = u16(b, p + 28);
    const extraLength = u16(b, p + 30);
    const commentLength = u16(b, p + 32);
    const name = decoder.decode(b.subarray(p + 46, p + 46 + nameLength));
    if (!name.endsWith("/")) {
      entries.push({ name, method: u16(b, p + 10), compressedSize: u32(b, p + 20), size: u32(b, p + 24), offset: u32(b, p + 42) });
    }
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readZipEntry(b: Uint8Array, e: ZipEntry): Uint8Array {
  if (u32(b, e.offset) !== 0x04034b50) throw new DicomError("El ZIP está dañado.");
  const start = e.offset + 30 + u16(b, e.offset + 26) + u16(b, e.offset + 28);
  const data = b.subarray(start, start + e.compressedSize);
  if (e.method === 0) return data;
  if (e.method === 8) return inflateSync(data, { out: new Uint8Array(e.size) });
  throw new DicomError("El ZIP usa una compresión que el visor no abre.");
}

export function isZip(b: Uint8Array) {
  return b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4;
}

function compareItems(a: StackItem, b: StackItem) {
  // Primero la posición real del corte; si no la hay, el número de instancia, la ubicación y el nombre.
  const keys: [number | null, number | null][] = [
    [a.order.slicePosition, b.order.slicePosition],
    [a.order.instanceNumber, b.order.instanceNumber],
    [a.order.sliceLocation, b.order.sliceLocation],
  ];
  for (const [x, y] of keys) {
    if (x !== null && y !== null && x !== y) return x - y;
  }
  return a.name.localeCompare(b.name, undefined, { numeric: true }) || a.frame - b.frame;
}

function imageBytes(image: DicomImage) {
  return (image.values?.byteLength ?? 0) + (image.rgba?.byteLength ?? 0) + 1024;
}

export class DicomStack {
  readonly series: Series[];
  /** Archivos que no se pudieron leer (no DICOM, dañados o sin imagen). */
  readonly unreadable: number;
  private readonly bytes: Uint8Array;
  private readonly entries: ZipEntry[] | null;
  private readonly files = new Map<number, DicomFile>();
  private readonly cache = new Map<string, DicomImage>();
  private readonly pending = new Map<string, Promise<DicomImage>>();
  private cacheBytes = 0;

  private constructor(bytes: Uint8Array, entries: ZipEntry[] | null, items: StackItem[], unreadable: number) {
    this.bytes = bytes;
    this.entries = entries;
    this.unreadable = unreadable;
    this.series = DicomStack.group(items);
  }

  static async load(bytes: Uint8Array, onProgress: (p: LoadProgress) => void): Promise<DicomStack> {
    if (!isZip(bytes)) {
      const file = openDicom(bytes);
      const items = Array.from({ length: file.order.hasPixels ? file.info.frames : 0 }, (_, frame) => ({
        id: `0:${frame}`,
        source: 0,
        frame,
        order: { ...file.order, slicePosition: null, instanceNumber: frame + 1, sliceLocation: null },
        name: "",
      }));
      if (items.length === 0) throw new DicomError("El archivo DICOM no trae imagen (puede ser un informe o una serie sin píxeles).");
      const stack = new DicomStack(bytes, null, items, 0);
      stack.files.set(0, file);
      return stack;
    }
    const entries = readZipIndex(bytes);
    const items: StackItem[] = [];
    let unreadable = 0;
    for (let i = 0; i < entries.length; i++) {
      try {
        // Solo se leen los metadatos; los píxeles se decodifican al mostrar cada imagen.
        const file = openDicom(readZipEntry(bytes, entries[i]));
        if (!file.order.hasPixels) {
          unreadable++;
          continue;
        }
        for (let frame = 0; frame < file.info.frames; frame++) {
          items.push({ id: `${i}:${frame}`, source: i, frame, order: file.order, name: entries[i].name });
        }
      } catch {
        unreadable++;
      }
      if (i % 16 === 15) {
        onProgress({ phase: "read", done: i + 1, total: entries.length });
        // Cede el hilo para que la página siga respondiendo y muestre el avance.
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    if (items.length === 0) throw new DicomError("El ZIP no trae imágenes DICOM que el visor pueda abrir.");
    return new DicomStack(bytes, entries, items, unreadable);
  }

  /** Agrupa por serie; si hay varias, añade «Todas las imágenes» para recorrerlas seguidas. */
  private static group(items: StackItem[]): Series[] {
    const bySeries = new Map<string, StackItem[]>();
    for (const item of items) {
      const key = item.order.seriesUid ?? "sin-serie";
      bySeries.set(key, [...(bySeries.get(key) ?? []), item]);
    }
    const series = [...bySeries.entries()].map(([key, list]) => {
      const first = list[0].order;
      const label = [first.seriesNumber !== null ? `Serie ${first.seriesNumber}` : "Serie", first.seriesDescription].filter(Boolean).join(" · ");
      return { key, label, items: list.sort(compareItems), number: first.seriesNumber ?? Number.MAX_SAFE_INTEGER };
    });
    series.sort((a, b) => a.number - b.number || b.items.length - a.items.length);
    const result: Series[] = series.map(({ key, label, items }) => ({ key, label, items }));
    if (result.length > 1) {
      result.unshift({ key: "todas", label: "Todas las imágenes", items: series.flatMap((s) => s.items) });
    }
    return result;
  }

  /** Serie que se abre primero: la más grande si reúne al menos la mitad de las imágenes; si no, todas. */
  get defaultSeries(): Series {
    if (this.series.length === 1) return this.series[0];
    const all = this.series[0];
    const largest = this.series.slice(1).reduce((a, b) => (b.items.length > a.items.length ? b : a));
    return largest.items.length * 2 >= all.items.length ? largest : all;
  }

  peek(item: StackItem): DicomImage | undefined {
    const image = this.cache.get(item.id);
    if (image) {
      // Recién usada: pasa al final para salir la última de la caché.
      this.cache.delete(item.id);
      this.cache.set(item.id, image);
    }
    return image;
  }

  image(item: StackItem): Promise<DicomImage> {
    const cached = this.peek(item);
    if (cached) return Promise.resolve(cached);
    const running = this.pending.get(item.id);
    if (running) return running;
    const task = this.file(item.source)
      .decodeFrame(item.frame)
      .then((image) => {
        this.cache.set(item.id, image);
        this.cacheBytes += imageBytes(image);
        for (const [id, old] of this.cache) {
          if (this.cacheBytes <= CACHE_BUDGET || this.cache.size <= 2) break;
          this.cache.delete(id);
          this.cacheBytes -= imageBytes(old);
        }
        return image;
      })
      .finally(() => this.pending.delete(item.id));
    this.pending.set(item.id, task);
    return task;
  }

  private file(source: number): DicomFile {
    const known = this.files.get(source);
    if (known) return known;
    if (!this.entries) throw new DicomError("No se encontró la imagen.");
    const file = openDicom(readZipEntry(this.bytes, this.entries[source]));
    // Se guardan pocos archivos abiertos: sirven para los de varios cuadros sin retener todo el ZIP inflado.
    if (this.files.size >= 4) this.files.delete(this.files.keys().next().value!);
    this.files.set(source, file);
    return file;
  }
}

/** Descarga con avance (las series pueden pesar decenas de MB). */
export async function download(src: string, onProgress: (p: LoadProgress) => void): Promise<Uint8Array> {
  const res = await fetch(src, { cache: "no-store" });
  if (!res.ok) throw new DicomError(res.status === 404 ? "El archivo ya no existe." : "No se pudo descargar el archivo.");
  const total = Number(res.headers.get("Content-Length")) || 0;
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let done = 0;
  for (;;) {
    const { value, done: finished } = await reader.read();
    if (finished) break;
    chunks.push(value);
    done += value.length;
    onProgress({ phase: "download", done, total });
  }
  const out = new Uint8Array(done);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
