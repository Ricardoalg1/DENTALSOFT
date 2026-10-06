import type { Metadata } from "next";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMe } from "@/lib/api";

export const metadata: Metadata = { title: "Inicio" };

const NEXT_STEPS = [
  { title: "Agenda", text: "Citas por odontólogo y sede, con estados y recordatorios." },
  { title: "Historia clínica", text: "Anamnesis, odontograma, evoluciones y consentimientos." },
  { title: "Facturación electrónica", text: "Facturas DIAN y generación de RIPS (Res. 2275 de 2023)." },
];

export default async function DashboardPage() {
  const me = await getMe();
  const firstName = me.fullName.split(" ")[0];
  return (
    <div className="grid max-w-4xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hola, {firstName}</h1>
        <p className="text-muted-foreground">Bienvenido al panel de {me.clinicName}.</p>
      </div>
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
