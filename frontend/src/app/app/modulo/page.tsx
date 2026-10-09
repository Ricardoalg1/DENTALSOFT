import type { Metadata } from "next";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getMe } from "@/lib/api";
import { MODULE_LABELS } from "@/lib/platform";
import type { ModuleKey } from "@/lib/types";

export const metadata: Metadata = { title: "Módulo no incluido" };

export default async function ModuleUnavailablePage({ searchParams }: PageProps<"/app/modulo">) {
  const [{ m }, me] = await Promise.all([searchParams, getMe()]);
  const label = typeof m === "string" && Object.hasOwn(MODULE_LABELS, m) ? MODULE_LABELS[m as ModuleKey] : "Este módulo";
  return (
    <div className="mx-auto mt-16 grid max-w-md justify-items-center gap-4 text-center">
      <LockKeyhole className="size-10 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-semibold tracking-tight">{label} no está incluido en tu plan</h1>
      <p className="text-muted-foreground">
        El plan {me.subscription?.planName ?? "actual"} de {me.clinicName} no incluye esta función. Escribe al equipo de
        Occlus y la habilitamos.
      </p>
      <Link href="/app" className={buttonVariants({ variant: "outline" })}>
        Volver al inicio
      </Link>
    </div>
  );
}
