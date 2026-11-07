import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import type { BookingInfo } from "@/lib/booking";
import { BookingWizard } from "./booking-wizard";

export const metadata: Metadata = { title: "Reservar una cita" };

export default async function BookingPage({ params }: PageProps<"/reservar/[slug]">) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) notFound();
  let info: BookingInfo;
  try {
    info = await api<BookingInfo>(`/api/public/booking/${encodeURIComponent(slug)}`, { auth: false });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const open = info.channels.length > 0 && info.dentists.length > 0;
  return (
    <main className="flex min-h-svh flex-col items-center gap-6 bg-muted/40 px-4 py-10">
      <Logo className="text-lg" />
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-xl">Reservar una cita</CardTitle>
          <CardDescription>{info.clinicName}. Duración aproximada: {info.durationMinutes} minutos. La clínica confirmará tu solicitud.</CardDescription>
        </CardHeader>
        <CardContent>
          {open ? <BookingWizard slug={slug} info={info} /> : <p className="text-sm">Las reservas en línea no están disponibles en este momento. Por favor, llama a la clínica.</p>}
        </CardContent>
      </Card>
    </main>
  );
}
