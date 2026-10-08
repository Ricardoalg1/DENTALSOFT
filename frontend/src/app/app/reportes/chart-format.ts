/** "$ 1,2 M" / "$ 350 mil" / "$ 900": pesos compactos para ejes y etiquetas cortas. */
export function formatCOPCompact(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$ ${(value / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M`;
  if (abs >= 1_000) return `$ ${Math.round(value / 1_000).toLocaleString("es-CO")} mil`;
  return `$ ${value.toLocaleString("es-CO")}`;
}

/** Escala "limpia" para el eje: el máximo se redondea a 1, 2, 2.5 o 5 × 10^n y se divide en 4. */
export function niceTicks(max: number, count = 4) {
  if (max <= 0) return [0];
  const rough = max / count;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  return Array.from({ length: count + 1 }, (_, i) => i * step);
}

export function formatPercent(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)} %`;
}
