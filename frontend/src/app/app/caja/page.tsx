import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { api, getMe } from "@/lib/api";
import { canManageCash, type CashSession, type Site } from "@/lib/types";
import { CashPanel } from "./cash-panel";

export const metadata: Metadata = { title: "Caja" };

export default async function CashPage() {
  const me = await getMe();
  if (me.role === "ASSISTANT") redirect("/app");
  const [sessions, sites] = await Promise.all([api<CashSession[]>("/api/cash-sessions"), api<Site[]>("/api/sites")]);
  return <div className="mx-auto grid max-w-5xl gap-6"><header><h1 className="text-2xl font-semibold tracking-tight">Caja</h1><p className="text-muted-foreground">Turnos por sede, recaudos y cierres de caja.</p></header><CashPanel sessions={sessions} sites={sites.filter(s => s.active)} canManage={canManageCash(me)} /></div>;
}
