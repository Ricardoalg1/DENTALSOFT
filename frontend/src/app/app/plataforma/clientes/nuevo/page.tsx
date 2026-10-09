import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import type { ModuleInfo, PlanDto } from "@/lib/platform";
import type { Lead } from "@/lib/marketing";
import { CreateClientForm } from "./create-client-form";

export const metadata: Metadata = { title: "Nuevo cliente · Plataforma" };

export default async function NewClientPage({ searchParams }: PageProps<"/app/plataforma/clientes/nuevo">) {
  const sp = await searchParams;
  const leadId = typeof sp.lead === "string" && /^[0-9a-f-]{36}$/i.test(sp.lead) ? sp.lead : undefined;
  const [plans, modules, lead] = await Promise.all([
    api<PlanDto[]>("/api/platform/plans"),
    api<ModuleInfo[]>("/api/platform/modules"),
    // Si la solicitud ya no existe, se crea el cliente en blanco en vez de fallar.
    leadId ? api<Lead>(`/api/marketing/leads/${leadId}`).catch(() => null) : Promise.resolve(null),
  ]);
  const wanted = lead?.plan?.toUpperCase();
  return (
    <div className="grid max-w-3xl gap-6">
      <Link href="/app/plataforma/clientes" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Clientes
      </Link>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Nuevo cliente</h2>
        <p className="text-muted-foreground">
          Crea la clínica, su administrador y su suscripción en un solo paso.
          {lead && <> Datos tomados de la solicitud de <strong>{lead.clinicName}</strong>; al crear, quedará marcada como ganada.</>}
        </p>
      </div>
      <CreateClientForm
        plans={plans.filter((p) => p.active || p.code === "INTERNAL")}
        modules={modules}
        lead={
          lead && leadId
            ? {
                id: leadId,
                clinicName: lead.clinicName,
                contactName: lead.name,
                contactEmail: lead.email,
                contactPhone: lead.phone ?? "",
                planCode: plans.find((p) => p.code === wanted)?.code,
              }
            : undefined
        }
      />
    </div>
  );
}
