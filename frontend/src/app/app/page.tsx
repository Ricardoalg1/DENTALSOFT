import type { Metadata } from "next";
import Link from "next/link";
import { AppointmentList } from "@/app/app/agenda/appointment-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { todayRangeCO } from "@/lib/agenda-time";
import { api, getMe } from "@/lib/api";
import type { Appointment } from "@/lib/types";

export const metadata: Metadata = { title: "Inicio" };

const NEXT_STEPS = [
  { title: "Historia clínica", text: "Anamnesis, odontograma, evoluciones y consentimientos." },
  { title: "Facturación electrónica", text: "Facturas DIAN y generación de RIPS (Res. 2275 de 2023)." },
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
        <h2 className="text-sm font-medium text-muted-foreground">Próximos módulos</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {NEXT_STEPS.map((s) => (
            <Card key={s.title} size="sm">
              <CardHeader>
                <CardTitle>{s.title}</CardTitle>
                <CardDescription>{s.text}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
