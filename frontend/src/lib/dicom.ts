/**
 * Lectura de radiografías DICOM 2D en el navegador. Solo visualización: no interpreta ni detecta hallazgos.
 *
 * Abre archivos sin comprimir (little o big endian), JPEG sin pérdida (lo más común en equipos dentales) y
 * JPEG básico, con uno o varios cuadros. JPEG 2000, JPEG-LS y RLE se informan como no soportados.
 */
import * as dicomParser from "dicom-parser";

export type DicomInfo = {
  patientName: string | null;
  studyDate: string | null;
  modality: string | null;
  manufacturer: string | null;
  bodyPart: string | null;
  description: string | null;
  transferSyntax: string;
  compression: string;
  frames: number;
};

/** Datos para ordenar una serie (tomografía, set de periapicales…). */
export type DicomOrder = {
  seriesUid: string | null;
  seriesNumber: number | null;
  seriesDescription: string | null;
  instanceNumber: number | null;
  /** Posición del corte proyectada sobre la normal del plano (mm); la forma fiable de ordenar cortes. */
  slicePosition: number | null;
  sliceLocation: number | null;
  sliceThickness: number | null;
  hasPixels: boolean;
};

export type DicomImage = {
  width: number;
  height: number;
  /** Gris: valores ya con pendiente e intercepto aplicados. Color: null. */
  values: Float32Array | null;
  /** Color: RGBA listo para pintar. Gris: null. */
  rgba: Uint8ClampedArray | null;
  min: number;
  max: number;
  windowCenter: number;
  windowWidth: number;
  /** MONOCHROME1: el blanco es el valor bajo; el visor lo muestra invertido por defecto. */
  inverted: boolean;
  /** Milímetros por píxel [fila, columna], si el archivo trae la calibración. */
  pixelSpacing: [number, number] | null;
  /** Los valores son unidades Hounsfield (TC con pendiente e intercepto). */
  hounsfield: boolean;
  info: DicomInfo;
};

/** Archivo DICOM ya leído: los metadatos están listos y cada cuadro se decodifica cuando se pide. */
export type DicomFile = {
  info: DicomInfo;
  order: DicomOrder;
  decodeFrame(frame: number): Promise<DicomImage>;
};

export class DicomError extends Error {}

const SYNTAX_NAMES: Record<string, string> = {
  "1.2.840.10008.1.2": "Sin comprimir (implícito)",
  "1.2.840.10008.1.2.1": "Sin comprimir",
  "1.2.840.10008.1.2.2": "Sin comprimir (big endian)",
  "1.2.840.10008.1.2.4.50": "JPEG",
  "1.2.840.10008.1.2.4.51": "JPEG",
  "1.2.840.10008.1.2.4.57": "JPEG sin pérdida",
  "1.2.840.10008.1.2.4.70": "JPEG sin pérdida",
  "1.2.840.10008.1.2.4.80": "JPEG-LS",
  "1.2.840.10008.1.2.4.81": "JPEG-LS",
  "1.2.840.10008.1.2.4.90": "JPEG 2000",
  "1.2.840.10008.1.2.4.91": "JPEG 2000",
  "1.2.840.10008.1.2.5": "RLE",
  "1.2.840.10008.1.2.1.99": "Deflate",
};

const UNCOMPRESSED = new Set(["1.2.840.10008.1.2", "1.2.840.10008.1.2.1", "1.2.840.10008.1.2.2"]);
const LOSSLESS = new Set(["1.2.840.10008.1.2.4.57", "1.2.840.10008.1.2.4.70"]);
const BASELINE = new Set(["1.2.840.10008.1.2.4.50", "1.2.840.10008.1.2.4.51"]);

function str(ds: dicomParser.DataSet, tag: string): string | null {
  const v = ds.string(tag)?.trim();
  return v ? v : null;
}

function firstNumber(ds: dicomParser.DataSet, tag: string): number | null {
  const v = ds.string(tag);
  if (!v) return null;
  const n = Number.parseFloat(v.split("\\")[0]);
  return Number.isFinite(n) ? n : null;
}

function spacing(ds: dicomParser.DataSet): [number, number] | null {
  // PixelSpacing (paciente) y, si no está, ImagerPixelSpacing (detector).
  for (const tag of ["x00280030", "x00181164"]) {
    const parts = ds.string(tag)?.split("\\").map(Number.parseFloat);
    if (parts && parts.length >= 2 && parts.every((n) => Number.isFinite(n) && n > 0)) return [parts[0], parts[1]];
  }
  return null;
}

function formatDate(da: string | null) {
  return da && /^\d{8}$/.test(da) ? `${da.slice(0, 4)}-${da.slice(4, 6)}-${da.slice(6, 8)}` : da;
}

function frameBytes(ds: dicomParser.DataSet, element: dicomParser.Element, frame: number, frames: number, frameSize: number, table: { current?: number[] }): Uint8Array {
  if (element.encapsulatedPixelData) {
    const fragments = element.fragments ?? [];
    if (element.basicOffsetTable && element.basicOffsetTable.length > 0) {
      return dicomParser.readEncapsulatedImageFrame(ds, element, frame) as Uint8Array;
    }
    if (frames === 1) return dicomParser.readEncapsulatedPixelDataFromFragments(ds, element, 0, fragments.length) as Uint8Array;
    if (fragments.length === frames) return dicomParser.readEncapsulatedPixelDataFromFragments(ds, element, frame, 1) as Uint8Array;
    table.current ??= dicomParser.createJPEGBasicOffsetTable(ds, element);
    return dicomParser.readEncapsulatedImageFrame(ds, element, frame, table.current) as Uint8Array;
  }
  const start = element.dataOffset + frame * frameSize;
  if (start + frameSize > ds.byteArray.length) throw new DicomError("El archivo está incompleto: faltan datos de la imagen.");
  // Copia propia: alinea el búfer para leerlo como enteros de 16 bits.
  return ds.byteArray.slice(start, start + frameSize) as Uint8Array;
}

function numbers(ds: dicomParser.DataSet, tag: string, count: number): number[] | null {
  const parts = ds.string(tag)?.split("\\").map(Number.parseFloat);
  return parts && parts.length >= count && parts.slice(0, count).every(Number.isFinite) ? parts.slice(0, count) : null;
}

function slicePosition(ds: dicomParser.DataSet): number | null {
  const position = numbers(ds, "x00200032", 3);
  const o = numbers(ds, "x00200037", 6);
  if (!position || !o) return null;
  // Normal del plano = fila × columna.
  const n = [o[1] * o[5] - o[2] * o[4], o[2] * o[3] - o[0] * o[5], o[0] * o[4] - o[1] * o[3]];
  return position[0] * n[0] + position[1] * n[1] + position[2] * n[2];
}

function toSamples(bytes: Uint8Array, bitsAllocated: number, signed: boolean, bigEndian: boolean, count: number) {
  if (bitsAllocated === 8) return signed ? new Int8Array(bytes.buffer, bytes.byteOffset, count) : bytes.subarray(0, count);
  if (bitsAllocated !== 16) throw new DicomError(`El visor no abre imágenes de ${bitsAllocated} bits por muestra.`);
  const buffer = bytes.byteOffset % 2 === 0 ? bytes.buffer : bytes.slice().buffer;
  const offset = bytes.byteOffset % 2 === 0 ? bytes.byteOffset : 0;
  if (bigEndian) {
    const view = new DataView(buffer, offset, count * 2);
    const out = signed ? new Int16Array(count) : new Uint16Array(count);
    for (let i = 0; i < count; i++) out[i] = signed ? view.getInt16(i * 2) : view.getUint16(i * 2);
    return out;
  }
  return signed ? new Int16Array(buffer, offset, count) : new Uint16Array(buffer, offset, count);
}

async function decodeBaseline(bytes: Uint8Array, width: number, height: number) {
  const bitmap = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new DicomError("El navegador no pudo preparar la imagen.");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, width, height).data;
}

export function openDicom(bytes: Uint8Array): DicomFile {
  let ds: dicomParser.DataSet;
  try {
    ds = dicomParser.parseDicom(bytes);
  } catch {
    throw new DicomError("El archivo no es un DICOM válido o está dañado.");
  }
  const transferSyntax = str(ds, "x00020010") ?? "1.2.840.10008.1.2";
  const info: DicomInfo = {
    patientName: str(ds, "x00100010")?.replaceAll("^", " ").trim() ?? null,
    studyDate: formatDate(str(ds, "x00080020")),
    modality: str(ds, "x00080060"),
    manufacturer: [str(ds, "x00080070"), str(ds, "x00081090")].filter(Boolean).join(" · ") || null,
    bodyPart: str(ds, "x00180015"),
    description: str(ds, "x0008103e") ?? str(ds, "x00081030"),
    transferSyntax,
    compression: SYNTAX_NAMES[transferSyntax] ?? transferSyntax,
    frames: Math.max(1, Math.round(firstNumber(ds, "x00280008") ?? 1)),
  };

  const element = ds.elements.x7fe00010;
  const order: DicomOrder = {
    seriesUid: str(ds, "x0020000e"),
    seriesNumber: firstNumber(ds, "x00200011"),
    seriesDescription: str(ds, "x0008103e"),
    instanceNumber: firstNumber(ds, "x00200013"),
    slicePosition: slicePosition(ds),
    sliceLocation: firstNumber(ds, "x00201041"),
    sliceThickness: firstNumber(ds, "x00180050"),
    hasPixels: Boolean(element),
  };
  const table: { current?: number[] } = {};
  return { info, order, decodeFrame: (frame) => decodeFrame(ds, info, frame, table) };
}

/** Atajo para un archivo suelto: primer cuadro. */
export async function decodeDicom(buffer: ArrayBuffer): Promise<DicomImage> {
  return openDicom(new Uint8Array(buffer)).decodeFrame(0);
}

async function decodeFrame(ds: dicomParser.DataSet, info: DicomInfo, frame: number, table: { current?: number[] }): Promise<DicomImage> {
  const transferSyntax = info.transferSyntax;
  const element = ds.elements.x7fe00010;
  if (!element) throw new DicomError("El archivo DICOM no trae imagen (puede ser un informe o una serie sin píxeles).");
  const height = ds.uint16("x00280010") ?? 0;
  const width = ds.uint16("x00280011") ?? 0;
  if (!width || !height) throw new DicomError("El archivo no indica el tamaño de la imagen.");
  const bitsAllocated = ds.uint16("x00280100") ?? 16;
  const samplesPerPixel = ds.uint16("x00280002") ?? 1;
  const signed = ds.uint16("x00280103") === 1;
  const photometric = (str(ds, "x00280004") ?? "MONOCHROME2").toUpperCase();
  const planar = ds.uint16("x00280006") === 1;
  const slope = firstNumber(ds, "x00281053") ?? 1;
  const intercept = firstNumber(ds, "x00281052") ?? 0;
  const count = width * height;

  if (!UNCOMPRESSED.has(transferSyntax) && !LOSSLESS.has(transferSyntax) && !BASELINE.has(transferSyntax)) {
    throw new DicomError(
      `Esta imagen está comprimida en ${info.compression}, que el visor todavía no abre. Expórtala desde el equipo sin compresión o en JPEG sin pérdida.`,
    );
  }

  const frameSize = count * samplesPerPixel * (bitsAllocated / 8);
  if (frame < 0 || frame >= info.frames) throw new DicomError("El cuadro pedido no existe.");
  const bytes = frameBytes(ds, element, frame, info.frames, frameSize, table);
  const hounsfield = info.modality === "CT" && ds.string("x00281052") !== undefined;
  const base = { width, height, pixelSpacing: spacing(ds), hounsfield, info };

  if (samplesPerPixel === 3) {
    let rgba: Uint8ClampedArray;
    if (BASELINE.has(transferSyntax)) {
      rgba = await decodeBaseline(bytes, width, height);
    } else {
      if (bitsAllocated !== 8 || photometric !== "RGB") throw new DicomError("El visor solo abre imágenes a color RGB de 8 bits.");
      const raw = LOSSLESS.has(transferSyntax) ? new Uint8Array(new (await import("jpeg-lossless-decoder-js")).Decoder().decompress(bytes.slice().buffer)) : bytes;
      rgba = new Uint8ClampedArray(count * 4);
      for (let i = 0; i < count; i++) {
        rgba[i * 4] = planar ? raw[i] : raw[i * 3];
        rgba[i * 4 + 1] = planar ? raw[i + count] : raw[i * 3 + 1];
        rgba[i * 4 + 2] = planar ? raw[i + 2 * count] : raw[i * 3 + 2];
        rgba[i * 4 + 3] = 255;
      }
    }
    return { ...base, values: null, rgba, min: 0, max: 255, windowCenter: 128, windowWidth: 256, inverted: false };
  }
  if (photometric !== "MONOCHROME1" && photometric !== "MONOCHROME2") {
    throw new DicomError(`El visor no abre imágenes con interpretación ${photometric}.`);
  }

  let samples: ArrayLike<number>;
  if (BASELINE.has(transferSyntax)) {
    const rgba = await decodeBaseline(bytes, width, height);
    const gray = new Uint8Array(count);
    for (let i = 0; i < count; i++) gray[i] = rgba[i * 4];
    samples = gray;
  } else if (LOSSLESS.has(transferSyntax)) {
    const { Decoder } = await import("jpeg-lossless-decoder-js");
    const out = new Decoder().decompress(bytes.slice().buffer);
    samples = toSamples(new Uint8Array(out), bitsAllocated, signed, false, count);
  } else {
    samples = toSamples(bytes, bitsAllocated, signed, transferSyntax === "1.2.840.10008.1.2.2", count);
  }

  // Solo cuentan los bits almacenados: algunos equipos dejan basura en los bits altos.
  const bitsStored = ds.uint16("x00280101") ?? bitsAllocated;
  const mask = !signed && bitsStored < bitsAllocated ? (1 << bitsStored) - 1 : null;
  const values = new Float32Array(count);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < count; i++) {
    const raw = mask === null ? samples[i] : samples[i] & mask;
    const v = raw * slope + intercept;
    values[i] = v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) throw new DicomError("La imagen no tiene datos.");
  const center = firstNumber(ds, "x00281050");
  const widthW = firstNumber(ds, "x00281051");
  const useFile = center !== null && widthW !== null && widthW > 1;
  return {
    ...base,
    values,
    rgba: null,
    min,
    max,
    windowCenter: useFile ? center : (min + max) / 2,
    windowWidth: useFile ? widthW : Math.max(1, max - min),
    inverted: photometric === "MONOCHROME1",
  };
}

/** Pinta la imagen en gris con la ventana indicada (centro y ancho, como en DICOM). */
export function renderGray(image: DicomImage, center: number, width: number, invert: boolean, out: Uint8ClampedArray) {
  const values = image.values;
  if (!values) {
    const rgba = image.rgba!;
    for (let i = 0; i < rgba.length; i += 4) {
      out[i] = invert ? 255 - rgba[i] : rgba[i];
      out[i + 1] = invert ? 255 - rgba[i + 1] : rgba[i + 1];
      out[i + 2] = invert ? 255 - rgba[i + 2] : rgba[i + 2];
      out[i + 3] = 255;
    }
    return;
  }
  const low = center - width / 2;
  const scale = 255 / Math.max(1, width);
  for (let i = 0, j = 0; i < values.length; i++, j += 4) {
    let g = (values[i] - low) * scale;
    g = g < 0 ? 0 : g > 255 ? 255 : g;
    if (invert) g = 255 - g;
    out[j] = g;
    out[j + 1] = g;
    out[j + 2] = g;
    out[j + 3] = 255;
  }
}
