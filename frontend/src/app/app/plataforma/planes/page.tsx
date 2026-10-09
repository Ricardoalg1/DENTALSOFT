import type { Metadata } from "next";
import { FormField } from "@/components/form-field";
import { ActionForm } from "@/components/platform/action-form";
import { ModulePicker } from "@/components/platform/module-picker";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { ModuleInfo, PlanDto } from "@/lib/platform";
import { updatePlan } from "../actions";

export const metadata: Metadata = { title: "Planes · Plataforma" };

export default async function PlansPage() {
  const [plans, modules] = await Promise.all([api<PlanDto[]>("/api/platform/plans"), api<ModuleInfo[]>("/api/platform/modules")]);
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Catálogo que se ofrece al crear clientes. Un cambio aplica a los clientes <strong>nuevos</strong>; los que ya tienen el plan conservan su precio y sus módulos
        (para moverlos, cambia su plan desde su ficha). Un precio vacío significa «a cotizar».
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {plans.map((p) => (
          <Card key={p.code}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {p.name} {!p.active && <Badge variant="outline">No se ofrece</Badge>}
              </CardTitle>
              <CardDescription>Código: {p.code}</CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={updatePlan} submit="Guardar plan" resetOnSuccess={false}>
                <input type="hidden" name="code" value={p.code} />
                <FormField name="name" id={`${p.code}-name`} label="Nombre" required defaultValue={p.name} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <FormField name="maxUsers" id={`${p.code}-maxUsers`} label="Usuarios" type="number" min={1} step="1" defaultValue={p.maxUsers ?? ""} placeholder="Sin límite" />
                  <FormField name="priceMonthly" id={`${p.code}-priceMonthly`} label="Precio mensual" type="number" min={0} step="1" defaultValue={p.priceMonthly ?? ""} placeholder="A cotizar" />
                  <FormField name="priceAnnual" id={`${p.code}-priceAnnual`} label="Precio anual" type="number" min={0} step="1" defaultValue={p.priceAnnual ?? ""} placeholder="A cotizar" />
                </div>
                <ModulePicker key={p.modules.join(",")} name="modules" modules={modules} defaultValue={p.modules} />
                {p.code !== "INTERNAL" && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="active" defaultChecked={p.active} className="size-4 accent-[var(--color-primary)]" />
                    Se ofrece al crear clientes
                  </label>
                )}
                {p.code === "INTERNAL" && <input type="hidden" name="active" value="on" />}
              </ActionForm>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
