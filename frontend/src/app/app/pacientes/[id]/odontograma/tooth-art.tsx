import { isDeciduous } from "./teeth";

/** Alto del dibujo anatómico de cada diente (unidades del viewBox del odontograma). */
export const ART_H = 64;
const ART_W = 40;
/** Los temporales se dibujan un poco más pequeños. */
export const DECIDUOUS_SCALE = 0.82;

/** Definiciones de degradados compartidas por todos los dientes. Va una sola vez dentro del <svg>. */
export function ToothArtDefs() {
  return (
    <defs>
      <linearGradient id="oc-enamel" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.55" stopColor="#f6f1e4" />
        <stop offset="1" stopColor="#d9d0ba" />
      </linearGradient>
      <linearGradient id="oc-root" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#f3e8c9" />
        <stop offset="0.6" stopColor="#e4d3a6" />
        <stop offset="1" stopColor="#c9b583" />
      </linearGradient>
      <linearGradient id="oc-cervix" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#bfa970" stopOpacity="0.45" />
        <stop offset="0.35" stopColor="#bfa970" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="oc-shine" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
        <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
      </linearGradient>
    </defs>
  );
}

type Shape = { crown: string; roots: string[]; shine: string };

// Dibujos con la corona hacia abajo y las raíces hacia arriba (arcada superior); la inferior se voltea.
const SHAPES: Record<string, Shape> = {
  central: {
    crown: "M9 34 C8 44 8 54 12 58 L28 58 C32 54 32 44 31 34 Z",
    roots: ["M12 34 C13 20 17 6 20 3 C23 6 27 20 28 34 Z"],
    shine: "M12 38 C11 46 12 52 14 55 C15 49 15 43 16 38 Z",
  },
  lateral: {
    crown: "M11 36 C10 45 11 54 14 58 L26 58 C29 54 30 45 29 36 Z",
    roots: ["M13 36 C14 22 18 8 20 4 C22 8 26 22 27 36 Z"],
    shine: "M13 39 C12 46 13 52 15 55 C16 50 16 44 17 39 Z",
  },
  canine: {
    crown: "M10 34 C9 44 12 52 20 61 C28 52 31 44 30 34 Z",
    roots: ["M12 34 C13 18 17 4 20 1 C23 4 27 18 28 34 Z"],
    shine: "M13 38 C12 45 15 51 18 56 C18 50 17 44 17 38 Z",
  },
  premolar: {
    crown: "M8 36 C7 46 9 54 13 57 L16 55 L20 58 L24 55 L27 57 C31 54 33 46 32 36 Z",
    roots: ["M12 36 C13 24 16 12 20 8 C24 12 27 24 28 36 Z"],
    shine: "M11 40 C10 47 11 52 13 55 C14 50 14 45 15 40 Z",
  },
  molarUpper: {
    crown: "M3 36 C2 46 4 54 8 57 L13 55 L17 58 L23 58 L27 55 L32 57 C36 54 38 46 37 36 Z",
    roots: [
      "M16 36 C16 26 18 16 20 10 C22 16 24 26 24 36 Z",
      "M6 36 C6 24 7 12 9 6 C12 12 14 24 15 36 Z",
      "M25 36 C26 24 28 12 31 6 C33 12 34 24 34 36 Z",
    ],
    shine: "M6 40 C5 47 6 52 9 55 C10 50 10 45 11 40 Z",
  },
  molarLower: {
    crown: "M3 36 C2 46 4 54 8 57 L13 55 L17 58 L23 58 L27 55 L32 57 C36 54 38 46 37 36 Z",
    roots: ["M6 36 C6 24 8 12 10 6 C13 14 16 26 18 36 Z", "M22 36 C24 26 27 14 30 6 C32 12 34 24 34 36 Z"],
    shine: "M6 40 C5 47 6 52 9 55 C10 50 10 45 11 40 Z",
  },
  wisdom: {
    crown: "M5 36 C4 45 6 53 10 56 L14 54 L20 57 L26 54 L30 56 C34 53 36 45 35 36 Z",
    roots: ["M8 36 C9 24 14 12 20 6 C26 12 31 24 32 36 Z"],
    shine: "M8 40 C7 46 8 51 11 54 C12 49 12 44 13 40 Z",
  },
};

/** Prolonga la base de las raíces por debajo de la corona para que no se vea una costura. */
const tuck = (d: string) => d.replace(/^M(\d+) (34|36)/, "M$1 44").replace(/ (\d+) (34|36) Z$/, " $1 44 Z");

const PREMOLAR_TWO_ROOTS = [
  "M10 36 C10 24 12 12 15 4 C17 14 19 26 20 36 Z",
  "M20 36 C21 26 23 14 25 4 C28 12 30 24 30 36 Z",
];

/**
 * Corona según el tipo de diente y raíces según su anatomía:
 * superiores: molares (6, 7, 8) con tres raíces, primer premolar con dos; inferiores: molares con dos.
 * En los temporales, los molares (4 y 5) siguen la misma regla: tres raíces arriba y dos abajo.
 */
function shapeFor(tooth: number): Shape {
  const n = tooth % 10;
  const upper = [1, 2, 5, 6].includes(Math.floor(tooth / 10));
  const molar = isDeciduous(tooth) ? n === 4 || n === 5 : n >= 6;
  if (n === 1) return SHAPES.central;
  if (n === 2) return SHAPES.lateral;
  if (n === 3) return SHAPES.canine;
  if (molar) {
    const base = n === 8 ? SHAPES.wisdom : SHAPES.molarUpper;
    return { ...base, roots: upper ? SHAPES.molarUpper.roots : SHAPES.molarLower.roots };
  }
  // premolares permanentes (4 y 5)
  return upper && n === 4 ? { ...SHAPES.premolar, roots: PREMOLAR_TWO_ROOTS } : SHAPES.premolar;
}

/**
 * Dibujo anatómico del diente (corona esmaltada y raíces) que acompaña a cada casilla del odontograma.
 * Arriba va con las raíces hacia arriba; abajo se voltea. Es solo ilustración: no recibe clics.
 */
export function ToothArt({ tooth, lower, absent, scale = 1 }: { tooth: number; lower: boolean; absent: boolean; scale?: number }) {
  const s = shapeFor(tooth);
  const cervixId = "oc-cervix";
  return (
    <g
      transform={lower ? `translate(${2 + (ART_W * (1 - scale)) / 2} ${(ART_H - 2) * scale}) scale(${scale} ${-scale})` : `translate(${2 + (ART_W * (1 - scale)) / 2} ${2 + ART_H * (1 - scale)}) scale(${scale})`}
      opacity={absent ? 0.22 : 1}
      pointerEvents="none"
      aria-hidden
    >
      <g stroke="#b3a688" strokeWidth={0.8} strokeLinejoin="round">
        {s.roots.map((d, i) => (
          <path key={i} d={tuck(d)} fill="url(#oc-root)" />
        ))}
        <path d={s.crown} fill="url(#oc-enamel)" />
      </g>
      <path d={s.crown} fill={`url(#${cervixId})`} />
      <path d={s.shine} fill="url(#oc-shine)" />
      <rect x={0} y={0} width={ART_W} height={ART_H - 4} fill="none" />
    </g>
  );
}
