/*
 * Dibujos de los dientes del periodontograma: ilustraciones propias sombreadas, en una caja de 40 × 100 unidades.
 * Se dibujan como un diente superior (raíz arriba, corona abajo) del lado derecho del paciente; quien los monta
 * voltea los inferiores y los del lado izquierdo se espejan aquí. La unión amelocementaria queda en y = CEJ_Y.
 */

export const ART_W = 40;
export const ART_H = 100;
export const CEJ_Y = 56;
const CX = 20;

type Occlusal = "incisal" | "canine" | "premolar" | "molar";
/** Raíz: borde cervical (x0–x1, relativo al centro), ápice (ax, relativo al centro; negativo = hacia distal) y largo. */
type Root = { x0: number; x1: number; ax: number; len: number };
type Spec = { crownW: number; neckW: number; crownH: number; occlusal: Occlusal; roots: Root[] };

const UPPER: Record<number, Spec> = {
  1: { crownW: 30, neckW: 20, crownH: 38, occlusal: "incisal", roots: [{ x0: -8, x1: 8, ax: -2, len: 46 }] },
  2: { crownW: 24, neckW: 16, crownH: 34, occlusal: "incisal", roots: [{ x0: -6, x1: 6, ax: -3, len: 44 }] },
  3: { crownW: 26, neckW: 18, crownH: 38, occlusal: "canine", roots: [{ x0: -7, x1: 7, ax: -3, len: 52 }] },
  4: {
    crownW: 25, neckW: 17, crownH: 31, occlusal: "premolar",
    roots: [{ x0: -7, x1: -0.5, ax: -5, len: 44 }, { x0: 0.5, x1: 7, ax: 2, len: 43 }],
  },
  5: { crownW: 25, neckW: 17, crownH: 30, occlusal: "premolar", roots: [{ x0: -7, x1: 7, ax: -3, len: 46 }] },
  6: {
    crownW: 36, neckW: 28, crownH: 28, occlusal: "molar",
    roots: [{ x0: -13, x1: -4, ax: -14, len: 40 }, { x0: -3, x1: 4, ax: 0, len: 44 }, { x0: 5, x1: 13, ax: 9, len: 38 }],
  },
  7: {
    crownW: 34, neckW: 26, crownH: 27, occlusal: "molar",
    roots: [{ x0: -12, x1: -3, ax: -12, len: 38 }, { x0: -3, x1: 4, ax: -2, len: 42 }, { x0: 4, x1: 12, ax: 6, len: 36 }],
  },
  8: {
    crownW: 32, neckW: 24, crownH: 25, occlusal: "molar",
    roots: [{ x0: -11, x1: 0, ax: -9, len: 32 }, { x0: 0, x1: 11, ax: 3, len: 30 }],
  },
};

const LOWER: Record<number, Spec> = {
  1: { crownW: 18, neckW: 12, crownH: 32, occlusal: "incisal", roots: [{ x0: -5, x1: 5, ax: -1, len: 44 }] },
  2: { crownW: 20, neckW: 13, crownH: 32, occlusal: "incisal", roots: [{ x0: -5, x1: 5, ax: -2, len: 46 }] },
  3: { crownW: 26, neckW: 18, crownH: 36, occlusal: "canine", roots: [{ x0: -7, x1: 7, ax: -3, len: 52 }] },
  4: { crownW: 24, neckW: 16, crownH: 30, occlusal: "premolar", roots: [{ x0: -6, x1: 6, ax: -3, len: 46 }] },
  5: { crownW: 25, neckW: 17, crownH: 29, occlusal: "premolar", roots: [{ x0: -6, x1: 6, ax: -3, len: 46 }] },
  6: {
    crownW: 38, neckW: 30, crownH: 28, occlusal: "molar",
    roots: [{ x0: -14, x1: -2, ax: -12, len: 42 }, { x0: 2, x1: 14, ax: 6, len: 40 }],
  },
  7: {
    crownW: 36, neckW: 28, crownH: 27, occlusal: "molar",
    roots: [{ x0: -13, x1: -2, ax: -12, len: 40 }, { x0: 2, x1: 13, ax: 4, len: 38 }],
  },
  8: {
    crownW: 34, neckW: 26, crownH: 26, occlusal: "molar",
    roots: [{ x0: -12, x1: -1, ax: -10, len: 34 }, { x0: 1, x1: 12, ax: 2, len: 32 }],
  },
};

const specFor = (tooth: number) => (Math.floor(tooth / 10) <= 2 ? UPPER : LOWER)[tooth % 10];

function crownPath({ crownW, neckW, crownH, occlusal }: Spec) {
  const C = CEJ_Y;
  const L = CX - crownW / 2;
  const R = CX + crownW / 2;
  const bottom = C + crownH;
  const mid = C + crownH * 0.5;
  const tip = occlusal === "canine" ? 6 : occlusal === "premolar" ? 4 : 0;
  const edge =
    occlusal === "molar"
      ? `Q ${CX - crownW / 4} ${bottom + 4} ${CX} ${bottom} Q ${CX + crownW / 4} ${bottom + 4} ${R - 3} ${bottom}`
      : occlusal === "incisal"
        ? `Q ${CX} ${bottom + 1.5} ${R - 3} ${bottom}`
        : `C ${CX - crownW / 4} ${bottom + 2} ${CX - 2} ${bottom + tip} ${CX} ${bottom + tip} C ${CX + 2} ${bottom + tip} ${CX + crownW / 4} ${bottom + 2} ${R - 3} ${bottom}`;
  return [
    `M ${CX - neckW / 2} ${C}`,
    `C ${CX - neckW / 2 - 1} ${C + crownH * 0.2} ${L} ${C + crownH * 0.25} ${L} ${mid}`,
    `C ${L} ${C + crownH * 0.8} ${L + 1} ${bottom} ${L + 3} ${bottom}`,
    edge,
    `C ${R - 1} ${bottom} ${R} ${C + crownH * 0.8} ${R} ${mid}`,
    `C ${R} ${C + crownH * 0.25} ${CX + neckW / 2 + 1} ${C + crownH * 0.2} ${CX + neckW / 2} ${C}`,
    `Q ${CX} ${C - 3} ${CX - neckW / 2} ${C} Z`,
  ].join(" ");
}

function rootPath({ x0, x1, ax, len }: Root) {
  const C = CEJ_Y + 1;
  const apexY = CEJ_Y - len;
  return [
    `M ${CX + x0} ${C}`,
    `C ${CX + x0 - 0.5} ${C - len * 0.5} ${CX + ax - 2} ${apexY + len * 0.12} ${CX + ax} ${apexY}`,
    `C ${CX + ax + 2} ${apexY + len * 0.12} ${CX + x1 + 0.5} ${C - len * 0.5} ${CX + x1} ${C}`,
    "Z",
  ].join(" ");
}

/** Detalles de superficie: lóbulos y crestas por vestibular; cíngulo y rebordes marginales por palatino/lingual. */
function details(spec: Spec, lingual: boolean) {
  const C = CEJ_Y;
  const bottom = C + spec.crownH;
  const w = spec.crownW;
  if (spec.occlusal === "molar") {
    return lingual
      ? [`M ${CX + 3} ${bottom - 1} C ${CX + 2} ${bottom - 8} ${CX + 1} ${C + 10} ${CX} ${C + 6}`]
      : [`M ${CX} ${bottom - 1} C ${CX - 1} ${bottom - 8} ${CX} ${C + 12} ${CX - 1} ${C + 8}`];
  }
  if (lingual) {
    return [
      `M ${CX - w / 4} ${C + 9} Q ${CX} ${C + 16} ${CX + w / 4} ${C + 9}`,
      `M ${CX - w / 2 + 3} ${C + 10} C ${CX - w / 2 + 3} ${bottom - 10} ${CX - w / 2 + 4} ${bottom - 4} ${CX - w / 2 + 5} ${bottom - 2}`,
      `M ${CX + w / 2 - 3} ${C + 10} C ${CX + w / 2 - 3} ${bottom - 10} ${CX + w / 2 - 4} ${bottom - 4} ${CX + w / 2 - 5} ${bottom - 2}`,
    ];
  }
  if (spec.occlusal === "incisal") {
    return [`M ${CX - w / 6} ${bottom - 2} L ${CX - w / 6} ${bottom - 12}`, `M ${CX + w / 6} ${bottom - 2} L ${CX + w / 6} ${bottom - 12}`];
  }
  return [`M ${CX} ${bottom} C ${CX - 1} ${bottom - 10} ${CX} ${C + 14} ${CX - 1} ${C + 8}`];
}

/** Degradados compartidos por todos los dientes del periodontograma (un solo <svg> oculto). */
export function PerioArtDefs({ id }: { id: string }) {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        <linearGradient id={`${id}-enamel`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#c9c9c9" />
          <stop offset="0.3" stopColor="#f4f4f4" />
          <stop offset="0.55" stopColor="#ffffff" />
          <stop offset="0.85" stopColor="#dcdcdc" />
          <stop offset="1" stopColor="#b5b5b5" />
        </linearGradient>
        <linearGradient id={`${id}-root`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#c2c2c2" />
          <stop offset="0.45" stopColor="#ececec" />
          <stop offset="1" stopColor="#bdbdbd" />
        </linearGradient>
        <linearGradient id={`${id}-metal`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#6b7280" />
          <stop offset="0.4" stopColor="#d1d5db" />
          <stop offset="0.6" stopColor="#f3f4f6" />
          <stop offset="1" stopColor="#4b5563" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Tornillo de implante con su pilar, en lugar de las raíces. */
function ImplantScrew({ defs }: { defs: string }) {
  const top = CEJ_Y - 42;
  const threads = Array.from({ length: 9 }, (_, i) => CEJ_Y - 6 - i * 4);
  return (
    <g>
      <path
        d={`M ${CX - 6} ${CEJ_Y - 2} L ${CX - 5} ${top + 4} Q ${CX} ${top - 2} ${CX + 5} ${top + 4} L ${CX + 6} ${CEJ_Y - 2} Z`}
        fill={`url(#${defs}-metal)`}
        stroke="#4b5563"
        strokeWidth={0.6}
      />
      {threads.map((y) => (
        <path key={y} d={`M ${CX - 7} ${y + 1} L ${CX + 7} ${y - 1}`} stroke="#4b5563" strokeWidth={0.9} strokeLinecap="round" />
      ))}
      <rect x={CX - 7} y={CEJ_Y - 3} width={14} height={4} rx={0.8} fill={`url(#${defs}-metal)`} stroke="#4b5563" strokeWidth={0.6} />
    </g>
  );
}

/**
 * Un diente (o implante) en la caja de 40 × 100, orientado como superior derecho; los del lado izquierdo se espejan.
 * Ausente: muy atenuado, como en SEPA.
 */
export function PerioToothArt({
  tooth,
  lingual,
  implant,
  missing,
  defs,
}: {
  tooth: number;
  lingual: boolean;
  implant: boolean;
  missing: boolean;
  defs: string;
}) {
  const spec = specFor(tooth);
  const mirror = [2, 3].includes(Math.floor(tooth / 10));
  const outline = { stroke: "#9a9a9a", strokeWidth: 0.6, strokeLinejoin: "round" as const };
  return (
    <g opacity={missing ? 0.2 : 1} transform={mirror ? `translate(${ART_W} 0) scale(-1 1)` : undefined} aria-hidden>
      {implant ? (
        <ImplantScrew defs={defs} />
      ) : (
        // En la vista palatina/lingual las raíces de atrás se ven más tenues.
        spec.roots.map((r, i) => (
          <path
            key={i}
            d={rootPath(r)}
            fill={`url(#${defs}-root)`}
            opacity={lingual && spec.roots.length === 3 && i !== 1 ? 0.75 : 1}
            {...outline}
          />
        ))
      )}
      <path d={crownPath(spec)} fill={`url(#${defs}-enamel)`} {...outline} />
      <ellipse
        cx={CX - spec.crownW / 6}
        cy={CEJ_Y + spec.crownH * 0.45}
        rx={spec.crownW / 9}
        ry={spec.crownH / 4}
        fill="#ffffff"
        opacity={0.7}
      />
      {details(spec, lingual).map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#b8b8b8" strokeWidth={0.7} strokeLinecap="round" />
      ))}
    </g>
  );
}

/** Símbolos de furca de SEPA: △ inicial, ◭ abierta (mitad rellena), ▲ completa. */
export function FurcationMark({ grade, x, y, size = 9 }: { grade: number; x: number; y: number; size?: number }) {
  if (!grade) return null;
  const h = size * 0.9;
  const pts = `${x},${y - h / 2} ${x - size / 2},${y + h / 2} ${x + size / 2},${y + h / 2}`;
  const color = "#826ef3";
  return (
    <g aria-hidden>
      {grade === 2 && <polygon points={`${x},${y - h / 2} ${x - size / 2},${y + h / 2} ${x},${y + h / 2}`} fill={color} />}
      <polygon points={pts} fill={grade === 3 ? color : "none"} stroke={color} strokeWidth={1.3} strokeLinejoin="round" />
    </g>
  );
}
