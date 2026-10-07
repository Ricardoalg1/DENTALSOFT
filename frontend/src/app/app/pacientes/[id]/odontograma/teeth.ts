import type { OdontogramCondition, OdontogramEntry, ToothSurface } from "@/lib/types";

/** Filas del odontograma en el orden en que se dibujan (vista del profesional, frente al paciente). */
export const ROWS: { left: number[]; right: number[]; deciduous: boolean }[] = [
  { left: [18, 17, 16, 15, 14, 13, 12, 11], right: [21, 22, 23, 24, 25, 26, 27, 28], deciduous: false },
  { left: [55, 54, 53, 52, 51], right: [61, 62, 63, 64, 65], deciduous: true },
  { left: [85, 84, 83, 82, 81], right: [71, 72, 73, 74, 75], deciduous: true },
  { left: [48, 47, 46, 45, 44, 43, 42, 41], right: [31, 32, 33, 34, 35, 36, 37, 38], deciduous: false },
];

export type Side = "top" | "bottom" | "left" | "right" | "center";

/**
 * Qué superficie queda en cada lado del dibujo. En dientes superiores arriba es vestibular;
 * en inferiores, abajo. Mesial siempre mira hacia la línea media.
 */
export function surfaceAt(tooth: number, side: Side): ToothSurface {
  const quadrant = Math.floor(tooth / 10);
  const upper = [1, 2, 5, 6].includes(quadrant);
  const patientRight = [1, 4, 5, 8].includes(quadrant); // se dibuja a la izquierda
  switch (side) {
    case "center":
      return "O";
    case "top":
      return upper ? "V" : "L";
    case "bottom":
      return upper ? "L" : "V";
    case "left":
      return patientRight ? "D" : "M";
    case "right":
      return patientRight ? "M" : "D";
  }
}

export const isDeciduous = (tooth: number) => Math.floor(tooth / 10) >= 5;
export const isAnterior = (tooth: number) => tooth % 10 <= 3;

/** Relleno de cada condición de superficie. */
export const SURFACE_FILL: Partial<Record<OdontogramCondition, string>> = {
  CARIES: "#ef4444",
  RESIN: "#3b82f6",
  AMALGAM: "#475569",
  SEALANT: "#14b8a6",
  TEMPORARY_FILLING: "#f59e0b",
};

export const KIND_COLOR = { finding: "#ef4444", done: "#3b82f6", other: "#6b7280" } as const;

const FILLED: OdontogramCondition[] = ["RESIN", "AMALGAM", "CROWN"];

/**
 * Índices epidemiológicos calculados a partir del odontograma vigente:
 * COP-D (permanentes: Cariados, Obturados, Perdidos) y ceo-d (temporales: cariados, extracción indicada,
 * obturados). Cada diente cuenta una sola vez; si tiene caries cuenta como cariado aunque tenga obturaciones.
 */
export function cariesIndices(entries: OdontogramEntry[]) {
  const byTooth = new Map<number, Set<OdontogramCondition>>();
  for (const e of entries) {
    if (!byTooth.has(e.tooth)) byTooth.set(e.tooth, new Set());
    byTooth.get(e.tooth)!.add(e.condition);
  }
  const cop = { c: 0, o: 0, p: 0 };
  const ceo = { c: 0, e: 0, o: 0 };
  for (const [tooth, set] of byTooth) {
    const carious = set.has("CARIES") || set.has("REMNANT_ROOT");
    const filled = FILLED.some((c) => set.has(c));
    if (isDeciduous(tooth)) {
      if (set.has("EXTRACTION_INDICATED")) ceo.e++;
      else if (carious) ceo.c++;
      else if (filled) ceo.o++;
    } else {
      if (set.has("MISSING")) cop.p++;
      else if (carious || set.has("EXTRACTION_INDICATED")) cop.c++;
      else if (filled) cop.o++;
    }
  }
  return { cop, ceo };
}
