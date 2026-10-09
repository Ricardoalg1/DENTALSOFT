import type { Metadata } from "next";
import Link from "next/link";
import { AppointmentList } from "@/app/app/agenda/appointment-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { todayRangeCO } from "@/lib/agenda-time";
import { api, getMe } from "@/lib/api";
import { MODULE_LABELS } from "@/lib/platform";
import { hasModule, type Appointment, type ModuleKey } from "@/lib/types";

export const metadata: Metadata = { title: "Inicio" };

/** Accesos rápidos a los módulos que la clínica tiene habilitados. */
const SHORTCUTS: { module: ModuleKey; href: string; text: string }[] = [
  { module: "CLINICAL_RECORD", href: "/app/historias", text: "Evoluciones, odontograma y consentimientos." },
  { module: "TREATMENTS_CASH", href: "/app/caja", text: "Caja del día, recibos y planes de tratamiento." },
  { module: "BILLING_RIPS", href: "/app/facturacion", text: "Facturas electrónicas DIAN y RIPS." },
  { module: "INVENTORY", href: "/app/inventario", text: "Insumos, lotes y vencimientos." },
  { module: "REPORTS", href: "/app/reportes", text: "Recaudo, producción y cartera." },
  { module: "MESSAGING", href: "/app/mensajes", text: "Recordatorios y respuestas por WhatsApp." },
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
    <div className="grid max-w-4xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hola, {firstName}</h1>
        <p className="text-muted-foreground">Bienvenido al panel de {me.clinicName}.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{me.role === "DENTIST" ? "Tus citas de hoy" : "Citas de hoy"}</CardTitle>
          <CardDescription>
            {today.length} {today.length === 1 ? "cita" : "citas"} ·{" "}
            <Link href="/app/agenda" className="text-primary hover:underline">
              Abrir agenda
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AppointmentList appointments={today} show="patient" showDate={false} empty="No hay citas para hoy." />
        </CardContent>
      </Card>
      <section className="grid gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Tus módulos</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {SHORTCUTS.filter((x) => hasModule(me, x.module)).map((x) => (
            <Link key={x.module} href={x.href} className="rounded-xl transition-colors hover:bg-muted/50">
              <Card size="sm">
                <CardHeader>
                  <CardTitle>{MODULE_LABELS[x.module]}</CardTitle>
                  <CardDescription>{x.text}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
