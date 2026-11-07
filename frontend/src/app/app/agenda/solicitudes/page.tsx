import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { api, getMe } from "@/lib/api";
import type { BookingRequest } from "@/lib/booking";
import { RequestCard } from "./request-card";

export const metadata: Metadata = { title: "Solicitudes en línea" };

export default async function RequestsPage() {
  const me = await getMe();
  if (me.role !== "ADMIN" && me.role !== "RECEPTION") redirect("/app/agenda");
  const requests = await api<BookingRequest[]>("/api/online-booking/requests");
  return (
    <div className="grid max-w-3xl gap-6">
      <Link href="/app/agenda" className="flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" />Agenda</Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Solicitudes en línea</h1>
        <p className="text-muted-foreground">Asocia cada solicitud a un paciente y confírmala: solo entonces entra a la agenda.</p>
      </div>
      {requests.length === 0 && <p className="text-sm text-muted-foreground">No hay solicitudes esperando respuesta.</p>}
      {requests.map((r) => <RequestCard key={r.id} request={r} />)}
    </div>
  );
}
