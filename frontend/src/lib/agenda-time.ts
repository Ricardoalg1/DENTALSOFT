/**
 * Colombia usa UTC-5 todo el año (sin horario de verano). La agenda trabaja con la "hora de pared"
 * de Colombia: FullCalendar corre en timeZone "UTC" y le pasamos las horas sin offset, así lo que
 * se ve es siempre la hora de Colombia, sin importar la zona horaria del computador.
 */
export const CO_OFFSET = "-05:00";
const CO_OFFSET_MS = 5 * 60 * 60 * 1000;

/** "2026-10-12T09:00:00-05:00" (del backend) → "2026-10-12T09:00:00" para FullCalendar. */
export function toWall(iso: string) {
  return iso.slice(0, 19);
}

/** Date de FullCalendar (hora de pared en UTC) → ISO con offset de Colombia para el backend. */
export function wallToApi(date: Date) {
  return `${date.toISOString().slice(0, 19)}${CO_OFFSET}`;
}

/** "Ahora" en hora de pared de Colombia, para el indicador de hora actual del calendario. */
export function nowWall() {
  return new Date(Date.now() - CO_OFFSET_MS);
}

/** Hoy en Colombia, como "YYYY-MM-DD". */
export function todayCO() {
  return nowWall().toISOString().slice(0, 10);
}

/** Rango [hoy 00:00, mañana 00:00) en Colombia. */
export function todayRangeCO() {
  const today = todayCO();
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { from: `${today}T00:00:00${CO_OFFSET}`, to: `${tomorrow}T00:00:00${CO_OFFSET}` };
}

/** "2026-10-12T09:30:00-05:00" → "09:30" */
export function timeOf(iso: string) {
  return iso.slice(11, 16);
}

export function minutesBetween(startIso: string, endIso: string) {
  return Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60000);
}

/** ¿Ya llegó la hora de inicio? (para habilitar "Atendida" / "No asistió"). */
export function hasStarted(iso: string) {
  return Date.parse(iso) <= Date.now();
}

/** Separa citas en próximas (orden ascendente) y anteriores (más reciente primero). */
export function splitByNow<T extends { endsAt: string }>(newestFirst: T[]) {
  const now = Date.now();
  return {
    upcoming: newestFirst.filter((a) => Date.parse(a.endsAt) >= now).reverse(),
    past: newestFirst.filter((a) => Date.parse(a.endsAt) < now),
  };
}
