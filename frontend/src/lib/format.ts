const TZ = "America/Bogota";

export function formatDate(iso: string) {
  // Fechas sin hora (yyyy-MM-dd) se interpretan en UTC para no correrse un día.
  const date = iso.length === 10 ? new Date(`${iso}T00:00:00Z`) : new Date(iso);
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeZone: iso.length === 10 ? "UTC" : TZ,
  }).format(date);
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: TZ }).format(
    new Date(iso),
  );
}

/** "2026-10-07" → "7 de octubre de 2026" */
export function formatLongDate(isoDate: string) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${isoDate}T00:00:00Z`));
}

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

/** 150000 → "$ 150.000" */
export function formatCOP(value: number) {
  return COP.format(value);
}

/** Número de recibo con ceros a la izquierda: 7 → "000007" */
export function formatReceipt(n: number) {
  return String(n).padStart(6, "0");
}
