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
