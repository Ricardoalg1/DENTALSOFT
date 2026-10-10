/** Ilustraciones originales: el viewBox muestra solamente el dibujo de la referencia. */
const CROPS = {
  patients: ["patients", 680, 410, 330, 250],
  history: ["history", 680, 440, 340, 270],
  agenda: ["agenda", 590, 425, 530, 355],
  today: ["today", 805, 180, 270, 155],
  commercial: ["commercial", 740, 520, 200, 150],
  metrics: ["commercial", 750, 900, 180, 90],
  sites: ["sites", 540, 435, 200, 180],
  cash: ["cash", 710, 400, 270, 170],
  closed: ["cash", 720, 780, 250, 150],
  prices: ["prices", 1020, 195, 340, 200],
  billing: ["billing", 1160, 145, 230, 100],
  inventory: ["inventory", 340, 480, 235, 165],
} as const;
export type ArtKind = keyof typeof CROPS;
export function ReferenceArt({ kind, className = "" }: { kind: ArtKind; className?: string }) {
  const [source, x, y, width, height] = CROPS[kind];
  return <svg aria-hidden="true" focusable="false" viewBox={`${x} ${y} ${width} ${height}`} className={`reference-art ${className}`}><image href={`/reference-art/${source}.png`} width="1448" height="1086" /></svg>;
}
export function EmptyState({ kind, title, description, children, compact = false }: { kind: ArtKind; title: string; description?: string; children?: React.ReactNode; compact?: boolean }) {
  return <div className={`reference-empty ${compact ? "reference-empty-compact" : ""}`}><ReferenceArt kind={kind} /><h2>{title}</h2>{description && <p>{description}</p>}{children && <div className="mt-5">{children}</div>}</div>;
}
