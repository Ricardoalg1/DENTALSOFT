import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getMe } from "@/lib/api";
import { todayCO } from "@/lib/agenda-time";
import { canManageCash } from "@/lib/types";
import { FinancingForm } from "./financing-form";

export const metadata: Metadata = { title: "Nuevo financiamiento" };

export default async function NewFinancingPage() {
  const me = await getMe();
  if (!canManageCash(me)) redirect("/app/financiamiento");
  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <div>
        <Link href="/app/financiamiento" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Financiamiento
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nuevo financiamiento</h1>
        <p className="text-muted-foreground">Acuerdo de pago a cuotas iguales, sin intereses. La cuota inicial se recauda como abono.</p>
      </div>
      <FinancingForm today={todayCO()} />
    </div>
  );
}
