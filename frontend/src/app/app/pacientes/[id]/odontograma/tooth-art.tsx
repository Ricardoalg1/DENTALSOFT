import { isDeciduous } from "./teeth";

/** Alto del dibujo anatómico de cada diente (unidades del viewBox del odontograma). */
export const ART_H = 64;
const ART_W = 40;
/** Los temporales se dibujan un poco más pequeños. */
export const DECIDUOUS_SCALE = 0.82;

/** Ya no hay degradados: el dibujo es de línea. Se conserva para no cambiar el lugar donde se monta. */
export function ToothArtDefs() {
  return null;
}

type Shape = { roots: string[]; crown: string; details: string[] };

/*
 * Dibujos de línea en vista vestibular, con la raíz hacia arriba (arcada superior) y la corona abajo.
 * Están hechos para los dientes del lado derecho del paciente (a la izquierda del odontograma): la raíz se inclina
 * hacia distal, es decir, lejos de la línea media. Los del lado izquierdo se espejan.
 */
const ANTERIOR: Record<string, Shape> = {
  central: {
    roots: ["M15 40 C15 28 15 14 17 3 C23 14 26 28 26 40"],
    crown: "M9 42 C8 51 10 58 14 61 C18 63 23 63 27 61 C31 58 32 51 31 42 C31 38 28 36 20 36 C12 36 9 38 9 42 Z",
    details: ["M16 54 L16 58", "M20 53 L20 58", "M24 54 L24 58"],
  },
  lateral: {
    roots: ["M16 40 C16 28 16 14 18 4 C23 14 25 28 25 40"],
    crown: "M11 43 C10 51 12 58 15 61 C18 63 22 63 25 61 C28 58 30 51 29 43 C29 39 26 37 20 37 C14 37 11 39 11 43 Z",
    details: ["M17 54 L17 58", "M23 54 L23 58"],
  },
  canine: {
    roots: ["M14 40 C13 26 14 10 18 1 C24 10 27 26 26 40"],
    crown: "M9 42 C8 50 11 56 20 63 C29 56 32 50 31 42 C31 38 28 36 20 36 C12 36 9 38 9 42 Z",
    details: ["M20 40 C19 48 18 54 20 59"],
  },
};

const PREMOLAR_CROWN = "M8 47 C8 39 13 36 20 36 C27 36 32 39 32 47 C32 55 27 62 20 62 C13 62 8 55 8 47 Z";
const PREMOLAR_GROOVE = "M14 48 C17 52 23 52 26 48";
const MOLAR_CROWN = "M3 48 C2 40 9 36 20 36 C31 36 38 40 37 48 C38 56 31 62 20 62 C9 62 2 56 3 48 Z";
const MOLAR_DETAILS = ["M9 47 C14 44 26 44 31 47", "M20 40 L20 58", "M10 55 C15 52 25 52 30 55"];
const WISDOM_CROWN = "M6 48 C5 41 11 37 20 37 C29 37 35 41 34 48 C35 55 29 61 20 61 C11 61 5 55 6 48 Z";
const WISDOM_DETAILS = ["M11 48 C15 45 25 45 29 48", "M20 41 L20 57"];

const ROOTS = {
  premolarOne: ["M15 40 C15 26 15 12 18 4 C23 12 25 26 25 40"],
  premolarTwo: ["M15 40 C14 28 15 16 17 6 C18 12 19 20 20 30 C21 20 22 12 23 6 C25 16 26 28 25 40"],
  molarUpper: [
    "M17 40 C17 30 18 20 20 12 C22 20 23 30 23 40",
    "M7 41 C4 30 4 18 8 6 C10 16 13 30 15 41",
    "M25 41 C27 30 30 18 33 7 C35 18 35 30 33 41",
  ],
  molarLower: ["M7 41 C3 30 3 16 8 5 C12 15 15 28 16 41", "M22 41 C23 30 26 18 32 8 C34 20 34 32 33 41"],
  wisdomUpper: ["M12 40 C10 28 11 16 16 8 C18 16 20 26 22 36", "M22 36 C24 26 27 16 31 9 C32 20 31 32 28 40"],
  wisdomLower: ["M10 40 C7 30 8 18 13 8 C17 18 20 30 22 40", "M22 40 C24 30 28 20 33 12 C34 24 32 34 30 40"],
};

/**
 * Anatomía por diente: incisivos, caninos y premolares con una raíz (el primer premolar superior, dos);
 * molares superiores con tres raíces e inferiores con dos. En los temporales, los molares (4 y 5) siguen la misma regla.
 */
function shapeFor(tooth: number): Shape {
  const n = tooth % 10;
  const upper = [1, 2, 5, 6].includes(Math.floor(tooth / 10));
  const molar = isDeciduous(tooth) ? n === 4 || n === 5 : n >= 6;
  if (n === 1) return ANTERIOR.central;
  if (n === 2) return ANTERIOR.lateral;
  if (n === 3) return ANTERIOR.canine;
  if (molar) {
    if (n === 8) return { roots: upper ? ROOTS.wisdomUpper : ROOTS.wisdomLower, crown: WISDOM_CROWN, details: WISDOM_DETAILS };
    return { roots: upper ? ROOTS.molarUpper : ROOTS.molarLower, crown: MOLAR_CROWN, details: MOLAR_DETAILS };
  }
  return { roots: upper && n === 4 ? ROOTS.premolarTwo : ROOTS.premolarOne, crown: PREMOLAR_CROWN, details: [PREMOLAR_GROOVE] };
}

/**
 * Dibujo de línea del diente que acompaña a cada casilla del odontograma. Arriba va con las raíces hacia arriba;
 * abajo se voltea. Los del lado izquierdo del paciente se espejan. Es solo ilustración: no recibe clics.
 */
export function ToothArt({ tooth, lower, absent, scale = 1 }: { tooth: number; lower: boolean; absent: boolean; scale?: number }) {
  const s = shapeFor(tooth);
  const mirror = [2, 3, 6, 7].includes(Math.floor(tooth / 10));
  const dx = 2 + (ART_W * (1 - scale)) / 2;
  const base = lower
    ? `translate(${dx} ${(ART_H - 2) * scale}) scale(${scale} ${-scale})`
    : `translate(${dx} ${2 + ART_H * (1 - scale)}) scale(${scale})`;
  const line = { fill: "var(--card)", stroke: "var(--foreground)" } as const;
  return (
    <g transform={base} opacity={absent ? 0.2 : 1} pointerEvents="none" aria-hidden>
      <g transform={mirror ? `translate(${ART_W} 0) scale(-1 1)` : undefined} strokeWidth={0.9} strokeLinejoin="round" strokeLinecap="round">
        {s.roots.map((d, i) => (
          <path key={i} d={d} style={line} />
        ))}
        <path d={s.crown} style={line} />
        {s.details.map((d, i) => (
          <path key={i} d={d} fill="none" style={{ stroke: "var(--foreground)" }} strokeWidth={0.7} />
        ))}
      </g>
    </g>
  );
}
