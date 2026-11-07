export type BookingRef = { id: string; name: string };
export type VisitOption = { code: string; label: string };
export type BookingInfo = {
  clinicName: string;
  dentists: BookingRef[];
  visitTypes: VisitOption[];
  durationMinutes: number;
  channels: ("EMAIL" | "WHATSAPP")[];
  consentVersion: string;
  consentText: string;
  captchaSiteKey: string | null;
};
export type BookingSlot = { startsAt: string; siteId: string; siteName: string };
export type ManageView = { clinicName: string; status: "PENDING" | "CONFIRMED"; startsAt: string; dentistName: string; siteName: string; visitType: string };
export type BookingSettings = {
  enabled: boolean;
  slug: string;
  visitTypes: string[];
  dentistIds: string[];
  durationMinutes: number;
  minNoticeHours: number;
  maxDaysAhead: number;
  publicUrl: string;
  captchaReady: boolean;
  mailReady: boolean;
};
export type PatientMatch = { id: string; fullName: string; document: string };
export type BookingRequest = {
  id: string;
  startsAt: string;
  endsAt: string;
  visitType: string;
  fullName: string;
  phone: string;
  email: string;
  verifiedChannel: "EMAIL" | "WHATSAPP";
  dentist: BookingRef;
  site: BookingRef;
  patientId: string | null;
  matches: PatientMatch[];
};

const ZONE = "America/Bogota";
export const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(new Date(iso));
export const dayLabel = (iso: string) => new Intl.DateTimeFormat("es-CO", { timeZone: ZONE, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
// Armada a mano: Node y el navegador separan distinto el «a. m.», y esa diferencia rompería la hidratación.
export const timeLabel = (iso: string) => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(new Date(iso));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("hour")}:${part("minute")} ${part("dayPeriod") === "AM" ? "a. m." : "p. m."}`;
};
export const whenLabel = (iso: string) => `${dayLabel(iso)}, ${timeLabel(iso)}`;
export const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
export const todayKey = () => dayKey(new Date().toISOString());
