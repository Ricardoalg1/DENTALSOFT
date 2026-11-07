import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { api, getMe } from "@/lib/api";
import type { BookingSettings } from "@/lib/booking";
import type { Professional } from "@/lib/types";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Página de reservas" };

export default async function OnlineBookingSettingsPage() {
  const me = await getMe();
  if (me.role !== "ADMIN") redirect("/app/agenda");
  const [settings, professionals] = await Promise.all([api<BookingSettings>("/api/online-booking/settings"), api<Professional[]>("/api/professionals")]);
  return (
    <div className="grid max-w-2xl gap-6">
      <Link href="/app/agenda" className="flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" />Agenda</Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Página de reservas</h1>
        <p className="text-muted-foreground">Tus pacientes eligen una hora libre y recepción la confirma antes de que entre a la agenda.</p>
      </div>
      <SettingsForm settings={settings} professionals={professionals.map((p) => ({ id: p.id, name: p.fullName }))} />
    </div>
  );
}
