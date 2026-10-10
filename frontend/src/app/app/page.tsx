import {
  CalendarDays,
  UsersRound,
  ClipboardPlus,
  Wallet,
  ReceiptText,
  Package,
  ChartColumn,
  MessageSquare,
  ArrowUpRight,
} from "lucide-react";
import { MODULE_COLORS } from "@/lib/module-colors";
import type { Metadata } from "next";
import Link from "next/link";
import { AppointmentList } from "@/app/app/agenda/appointment-list";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { todayRangeCO } from "@/lib/agenda-time";
import { api, getMe } from "@/lib/api";
import { MODULE_LABELS } from "@/lib/platform";
import { hasModule, type Appointment, type ModuleKey } from "@/lib/types";

export const metadata: Metadata = { title: "Inicio" };

/** Accesos rápidos a los módulos que la clínica tiene habilitados. */
const SHORTCUTS = [
  {
    module: "CLINICAL_RECORD" as ModuleKey,
    icon: ClipboardPlus,
    href: "/app/historias",
    text: "Evoluciones, odontograma y consentimientos.",
  },
  {
    module: "TREATMENTS_CASH" as ModuleKey,
    icon: Wallet,
    href: "/app/caja",
    text: "Caja del día, recibos y planes de tratamiento.",
  },
  {
    module: "BILLING_RIPS" as ModuleKey,
    icon: ReceiptText,
    href: "/app/facturacion",
    text: "Facturas electrónicas DIAN y RIPS.",
  },
  {
    module: "INVENTORY" as ModuleKey,
    icon: Package,
    href: "/app/inventario",
    text: "Insumos, lotes y vencimientos.",
  },
  {
    module: "REPORTS" as ModuleKey,
    icon: ChartColumn,
    href: "/app/reportes",
    text: "Recaudo, producción y cartera.",
  },
  {
    module: "MESSAGING" as ModuleKey,
    icon: MessageSquare,
    href: "/app/mensajes",
    text: "Recordatorios y respuestas por WhatsApp.",
  },
];

export default async function DashboardPage() {
  const me = await getMe();
  const firstName = me.fullName.split(" ")[0];
  // Un odontólogo ve sus citas; el resto del equipo, las de toda la clínica.
  const { from, to } = todayRangeCO();
  const params = new URLSearchParams({ from, to });
  if (me.role === "DENTIST") params.set("dentistId", me.id);
  const today = await api<Appointment[]>(`/api/appointments?${params}`);
  return (
    <div className="grid max-w-6xl gap-7">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Hola, {firstName}
        </h1>
        <p className="text-muted-foreground">
          Bienvenido al panel de {me.clinicName}.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            {me.role === "DENTIST" ? "Tus citas de hoy" : "Citas de hoy"}
          </CardTitle>
          <CardDescription>
            {today.length} {today.length === 1 ? "cita" : "citas"} ·{" "}
            <Link href="/app/agenda" className="text-primary hover:underline">
              Abrir agenda
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AppointmentList
            appointments={today}
            show="patient"
            showDate={false}
            empty="No hay citas para hoy."
          />
        </CardContent>
      </Card>
      <section className="grid gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Tus módulos
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              href: "/app/pacientes",
              label: "Pacientes",
              text: "Datos, contacto y seguimiento de tus pacientes.",
              icon: UsersRound,
              key: "patients",
            },
            {
              href: "/app/agenda",
              label: "Agenda",
              text: "Citas, horarios y disponibilidad del equipo.",
              icon: CalendarDays,
              key: "agenda",
            },
            ...SHORTCUTS.filter((x) => hasModule(me, x.module)).map((x) => ({
              ...x,
              key: x.module,
              label: MODULE_LABELS[x.module],
            })),
          ].map((x) => {
            const Icon = x.icon;
            const color = MODULE_COLORS[x.key];
            return (
              <Link
                key={x.key}
                href={x.href}
                data-hover-card
                className="group relative grid gap-5 rounded-2xl border bg-card p-5"
                style={{ borderTop: `3px solid ${color.color}` }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="grid size-12 place-items-center rounded-2xl"
                    style={{ color: color.color, background: color.background }}
                  >
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
                <div>
                  <h3 className="font-semibold">{x.label}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {x.text}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
