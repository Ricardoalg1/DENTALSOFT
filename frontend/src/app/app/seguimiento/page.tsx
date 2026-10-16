import type { Metadata } from "next";
import Link from "next/link";
import { Cake, MessageCircle, UserRoundX } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, getMe } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Seguimiento de pacientes" };

type Birthday = { id: string; fullName: string; phone: string | null; birthDate: string; nextBirthday: string; turning: number };
type Inactive = { id: string; fullName: string; phone: string | null; lastVisit: string; monthsAway: number };

/** Número colombiano de 10 dígitos → formato internacional para wa.me; otro formato válido se respeta; si no, sin enlace. */
function whatsapp(phone: string | null, text: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  const full = digits.length === 10 && digits.startsWith("3") ? `57${digits}` : digits.length >= 11 && digits.length <= 15 ? digits : null;
  return full ? `https://wa.me/${full}?text=${encodeURIComponent(text)}` : null;
}

const first = (name: string) => name.split(" ")[0];

function WhatsAppButton({ href }: { href: string | null }) {
  if (!href) return <span className="text-xs text-muted-foreground">Sin teléfono válido</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium hover:bg-muted">
      <MessageCircle className="size-4 text-primary" aria-hidden /> Escribir
    </a>
  );
}

export default async function FollowUpPage({ searchParams }: PageProps<"/app/seguimiento">) {
  const [sp, me] = await Promise.all([searchParams, getMe()]);
  if (me.role !== "ADMIN" && me.role !== "RECEPTION") {
    return <p className="text-muted-foreground">El seguimiento de pacientes es para administración y recepción.</p>;
  }
  const days = [7, 14, 30, 60].includes(Number(sp.dias)) ? Number(sp.dias) : 14;
  const months = [3, 6, 12, 24].includes(Number(sp.meses)) ? Number(sp.meses) : 6;
  const [birthdays, inactive] = await Promise.all([
    api<Birthday[]>(`/api/outreach/birthdays?days=${days}`),
    api<Inactive[]>(`/api/outreach/inactive?months=${months}`),
  ]);

  const chip = (href: string, label: string, on: boolean) => (
    <Link key={label} href={href} className={cn("rounded-full border px-3 py-1 text-sm", on ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-muted")}>
      {label}
    </Link>
  );

  return (
    <div className="grid max-w-4xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Seguimiento de pacientes</h1>
        <p className="text-muted-foreground">Felicita a tus pacientes en su cumpleaños y retoma el contacto con quienes llevan tiempo sin venir.</p>
      </div>
      <p role="note" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
        Escribe solo a pacientes que hayan autorizado comunicaciones (la plantilla de autorización de datos lo incluye) y en los horarios que permite la Ley 2300 de 2023 para contacto comercial: lunes a viernes de 7 a. m. a 7 p. m. y sábados de 8 a. m. a 3 p. m.; no domingos ni festivos. Cada botón abre WhatsApp con el mensaje listo para que lo revises y lo envíes tú.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2">
              <Cake className="size-5 text-primary" aria-hidden /> Cumpleaños próximos
            </span>
          </CardTitle>
          <CardDescription>
            <span className="mr-2">Mostrar los próximos:</span>
            <span className="inline-flex flex-wrap gap-1.5">
              {[7, 14, 30, 60].map((d) => chip(`/app/seguimiento?dias=${d}&meses=${months}`, `${d} días`, d === days))}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {birthdays.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nadie cumple años en este periodo.</p>
          ) : (
            <ul className="divide-y">
              {birthdays.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <div className="min-w-0">
                    <Link href={`/app/pacientes/${b.id}`} className="font-medium hover:underline">
                      {b.fullName}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(b.nextBirthday)} · cumple {b.turning} años{b.phone ? ` · ${b.phone}` : ""}
                    </p>
                  </div>
                  <WhatsAppButton
                    href={whatsapp(b.phone, `¡Feliz cumpleaños, ${first(b.fullName)}! 🎂 De parte de todo el equipo de ${me.clinicName} te deseamos un día muy especial. 😁`)}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2">
              <UserRoundX className="size-5 text-primary" aria-hidden /> Pacientes sin venir
            </span>
          </CardTitle>
          <CardDescription>
            <span className="mr-2">Sin atención hace más de:</span>
            <span className="inline-flex flex-wrap gap-1.5">
              {[3, 6, 12, 24].map((m) => chip(`/app/seguimiento?meses=${m}&dias=${days}`, `${m} meses`, m === months))}
            </span>
            <span className="mt-1 block text-xs">Solo pacientes que ya fueron atendidos y que no tienen una cita próxima.</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {inactive.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay pacientes en este periodo.</p>
          ) : (
            <ul className="divide-y">
              {inactive.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <div className="min-w-0">
                    <Link href={`/app/pacientes/${p.id}`} className="font-medium hover:underline">
                      {p.fullName}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      Última atención: {formatDate(p.lastVisit)} (hace {p.monthsAway} {p.monthsAway === 1 ? "mes" : "meses"}){p.phone ? ` · ${p.phone}` : ""}
                    </p>
                  </div>
                  <WhatsAppButton
                    href={whatsapp(p.phone, `Hola ${first(p.fullName)}, te escribimos de ${me.clinicName}. Hace un tiempo no te vemos y queremos saber cómo estás. ¿Te gustaría agendar una cita de control? 🦷`)}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
