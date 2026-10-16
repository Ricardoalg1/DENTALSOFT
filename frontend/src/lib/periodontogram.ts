import type { PerioChart, PerioSide, PerioTooth } from "@/lib/types";

/** Dientes permanentes por cuadrante, en el orden del dibujo (lado derecho del paciente a la izquierda). */
export const UPPER_QUADRANTS = [
  [18, 17, 16, 15, 14, 13, 12, 11],
  [21, 22, 23, 24, 25, 26, 27, 28],
] as const;
export const LOWER_QUADRANTS = [
  [48, 47, 46, 45, 44, 43, 42, 41],
  [31, 32, 33, 34, 35, 36, 37, 38],
] as const;
const TOTAL_TEETH = 32;
const SITES_PER_TOOTH = 6;

export const PD_MAX = 15;
export const GM_MIN = -10;
export const GM_MAX = 15;
export const WIDTH_MAX = 20;

export type Face = "buccal" | "lingual";

export const isUpper = (tooth: number) => Math.floor(tooth / 10) <= 2;

/**
 * Entradas de furca de una cara: molares superiores 1 por vestibular y 2 por palatino (mesial y distal),
 * primeros premolares superiores 2 por palatino, molares inferiores 1 por cara. Los implantes no tienen.
 */
export function furcationSites(tooth: number, face: Face): number {
  const n = tooth % 10;
  if (n >= 6) return isUpper(tooth) && face === "lingual" ? 2 : 1;
  if (isUpper(tooth) && n === 4 && face === "lingual") return 2;
  return 0;
}

/** Sondaje patológico: más de 3 mm en dientes, más de 5 mm en implantes (criterio de SEPA). */
export const pdDanger = (pd: number | null | undefined, implant: boolean) => (pd ?? 0) > (implant ? 5 : 3);

export const emptySide = (): PerioSide => ({
  pd: [null, null, null],
  gm: [null, null, null],
  bop: [0, 0, 0],
  suppuration: [false, false, false],
  plaque: [false, false, false],
  furcation: [],
});

export const getTooth = (teeth: PerioTooth[], n: number) => teeth.find((t) => t.tooth === n);

/** Devuelve la lista con el diente {@code n} transformado por {@code change} (se crea vacío si no estaba). */
export function updateTooth(teeth: PerioTooth[], n: number, change: (t: PerioTooth) => PerioTooth): PerioTooth[] {
  const current = getTooth(teeth, n);
  const next = change(current ?? { tooth: n });
  return current ? teeth.map((t) => (t.tooth === n ? next : t)) : [...teeth, next];
}

export type PerioStats = { meanPd: number; meanCal: number; plaquePct: number; bopPct: number };

/**
 * Los cuatro indicadores de SEPA, sobre los 6 sitios de cada diente o implante presente (un sitio sin dato cuenta 0):
 * sondaje medio, nivel de inserción medio (margen + sondaje), % de sitios con placa y % con sangrado.
 */
export function perioStats(chart: PerioChart | null): PerioStats {
  const teeth = chart?.teeth ?? [];
  const sites = (TOTAL_TEETH - teeth.filter((t) => t.missing).length) * SITES_PER_TOOTH;
  let pd = 0;
  let gm = 0;
  let plaque = 0;
  let bop = 0;
  for (const t of teeth) {
    if (t.missing) continue;
    for (const side of [t.buccal, t.lingual]) {
      if (!side) continue;
      for (let i = 0; i < 3; i++) {
        pd += side.pd[i] ?? 0;
        gm += side.gm[i] ?? 0;
        if (side.plaque[i]) plaque++;
        if (Number(side.bop[i]) > 0) bop++;
      }
    }
  }
  return sites
    ? { meanPd: pd / sites, meanCal: (pd + gm) / sites, plaquePct: (plaque / sites) * 100, bopPct: (bop / sites) * 100 }
    : { meanPd: 0, meanCal: 0, plaquePct: 0, bopPct: 0 };
}

export const hasPerioData = (chart: PerioChart | null | undefined): chart is PerioChart => !!chart && chart.teeth.length > 0;
