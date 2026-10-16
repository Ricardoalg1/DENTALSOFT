import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { api, getMe } from "@/lib/api";
import { todayCO } from "@/lib/agenda-time";
import { canCollect, type CashSession, type Procedure, type Professional, type Site } from "@/lib/types";
import { IncomeForm } from "./income-form";

export const metadata: Metadata = { title: "Nuevo ingreso" };

export default async function NewIncomePage() {
  const me = await getMe();
  if (!canCollect(me)) redirect("/app");
  const [sites, sessions, professionals, procedures] = await Promise.all([
    api<Site[]>("/api/sites"),
    api<CashSession[]>("/api/cash-sessions"),
    api<Professional[]>("/api/professionals"),
    api<Procedure[]>("/api/procedures"),
  ]);
  const openSites = new Set(sessions.filter((s) => !s.closedAt).map((s) => s.site.id));

  return (
    <div className="grid max-w-6xl gap-6">
      <div>
        <Link href="/app/caja" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Recaudos
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nuevo ingreso</h1>
        <p className="text-muted-foreground">Registra un nuevo ingreso o recibo del paciente.</p>
      </div>
      <IncomeForm
        sites={sites.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name, open: openSites.has(s.id) }))}
        professionals={professionals}
        procedures={procedures}
        today={todayCO()}
        defaultDentistId={professionals.some((p) => p.id === me.id) ? me.id : undefined}
      />
    </div>
  );
}
