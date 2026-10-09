import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { ClinicAnnouncement } from "@/lib/platform";
import type { Me } from "@/lib/types";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;

/** Días enteros que faltan (redondeado hacia arriba); negativo o cero si ya pasó. */
function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / DAY);
}

const TONES = {
  INFO: "border-border bg-card text-card-foreground",
  WARNING: "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100",
  CRITICAL: "border-destructive/40 bg-destructive/10 text-destructive",
} as const;

function Banner({ tone, title, children }: { tone: keyof typeof TONES; title: string; children?: React.ReactNode }) {
  const Icon = tone === "INFO" ? Info : tone === "WARNING" ? TriangleAlert : CircleAlert;
  return (
    <div role={tone === "CRITICAL" ? "alert" : "status"} className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-sm", TONES[tone])}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>
        <p className="font-medium">{title}</p>
        {children && <p className="opacity-90">{children}</p>}
      </div>
    </div>
  );
}

/** Avisos de suscripción y anuncios del equipo de Occlus. Si algo falla, no estorba al resto de la página. */
export async function SubscriptionBanners({ me }: { me: Me }) {
  const sub = me.subscription;
  const items: React.ReactNode[] = [];

  if (sub?.cancelAtPeriodEnd && sub.currentPeriodEnd) {
    items.push(
      <Banner key="cancel" tone="WARNING" title={`Tu suscripción termina el ${formatDate(sub.currentPeriodEnd)}`}>
        Después de esa fecha no podrás entrar. Si fue un error, escribe al equipo de Occlus.
      </Banner>,
    );
  } else if (sub?.status === "TRIAL" && sub.trialEndsAt) {
    const days = daysUntil(sub.trialEndsAt);
    if (days <= 5) {
      items.push(
        <Banner key="trial" tone={days <= 1 ? "CRITICAL" : "WARNING"} title={days <= 0 ? "Tu prueba terminó" : `Tu prueba termina en ${days} ${days === 1 ? "día" : "días"}`}>
          Para seguir usando Occlus sin interrupciones, comunícate con el equipo y activamos tu plan.
        </Banner>,
      );
    }
  } else if (sub && (sub.status === "PAST_DUE" || sub.inGrace) && sub.accessUntil) {
    items.push(
      <Banner key="due" tone="CRITICAL" title="Tu pago está pendiente">
        Puedes seguir trabajando hasta el {formatDate(sub.accessUntil)}. Después, el acceso se suspende hasta regularizar el pago.
      </Banner>,
    );
  }

  let announcements: ClinicAnnouncement[] = [];
  try {
    announcements = await api<ClinicAnnouncement[]>("/api/announcements");
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
  }
  for (const a of announcements) items.push(<Banner key={a.id} tone={a.level} title={a.title}>{a.body}</Banner>);

  if (!items.length) return null;
  return <div className="mb-6 grid max-w-5xl gap-2">{items}</div>;
}
