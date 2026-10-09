"use client";

import Link from "next/link";
import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { FormField } from "@/components/form-field";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { ActionForm } from "@/components/platform/action-form";
import { CopyButton } from "@/components/platform/copy-button";
import { ModulePicker } from "@/components/platform/module-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatCOP } from "@/lib/format";
import { CYCLE_LABELS, type CreatedClient, type ModuleInfo, type PlanDto } from "@/lib/platform";
import { createClient } from "../../actions";

type Lead = { id: string; clinicName: string; contactName: string; contactEmail: string; contactPhone: string; planCode?: string };

export function CreateClientForm({ plans, modules, lead }: { plans: PlanDto[]; modules: ModuleInfo[]; lead?: Lead }) {
  const [planCode, setPlanCode] = useState(lead?.planCode ?? plans.find((p) => p.code !== "INTERNAL")?.code ?? plans[0].code);
  const [cycle, setCycle] = useState<"MONTHLY" | "ANNUAL">("MONTHLY");
  const [customize, setCustomize] = useState(false);
  const [trialDays, setTrialDays] = useState(14);
  const [created, setCreated] = useState<CreatedClient>();
  const plan = plans.find((p) => p.code === planCode) ?? plans[0];
  const list = cycle === "MONTHLY" ? plan.priceMonthly : plan.priceAnnual;
  const quoted = list == null && plan.code !== "INTERNAL";

  if (created) return <Credentials created={created} onAnother={() => setCreated(undefined)} />;

  return (
    <ActionForm
      action={createClient}
      submit="Crear cliente"
      pendingLabel="Creando…"
      resetOnSuccess={false}
      onResult={(s) => s.created && setCreated(s.created)}
      className="grid gap-8"
    >
      {lead && <input type="hidden" name="leadId" value={lead.id} />}

      <section className="grid gap-4">
        <h3 className="font-semibold">Clínica</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="clinicName" label="Nombre de la clínica" required defaultValue={lead?.clinicName} />
          <FormField name="nit" label="NIT" defaultValue="" placeholder="900123456" />
          <FormField name="legalName" label="Razón social" defaultValue="" />
          <FormField name="city" label="Ciudad" defaultValue="" />
          <FormField name="contactName" label="Persona de contacto" defaultValue={lead?.contactName} />
          <FormField name="contactPhone" label="Teléfono de contacto" defaultValue={lead?.contactPhone} />
          <FormField name="contactEmail" label="Correo de contacto" type="email" defaultValue={lead?.contactEmail} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="notes">Notas internas</Label>
          <Textarea id="notes" name="notes" rows={2} placeholder="Cómo llegó, acuerdos, necesidades…" />
        </div>
      </section>

      <section className="grid gap-4">
        <h3 className="font-semibold">Administrador de la clínica</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="adminName" label="Nombre completo" required defaultValue={lead?.contactName} />
          <FormField name="adminEmail" label="Correo (será su usuario)" type="email" required defaultValue={lead?.contactEmail} />
        </div>
        <p className="text-sm text-muted-foreground">
          Se genera una contraseña temporal que verás una sola vez. Al ingresar, tendrá que elegir la suya.
        </p>
      </section>

      <section className="grid gap-4">
        <h3 className="font-semibold">Suscripción</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <NativeSelect
            name="planCode"
            label="Plan"
            value={planCode}
            onChange={(e) => {
              setPlanCode(e.target.value);
              setCustomize(false);
            }}
            options={Object.fromEntries(plans.map((p) => [p.code, p.name]))}
          />
          <NativeSelect name="billingCycle" label="Ciclo de cobro" value={cycle} onChange={(e) => setCycle(e.target.value as "MONTHLY" | "ANNUAL")} options={CYCLE_LABELS} />
          <FormField
            name="price"
            label={quoted ? "Precio pactado (COP)" : "Precio (COP)"}
            type="number"
            min={0}
            step="1"
            required={quoted}
            placeholder={list != null ? `Lista: ${formatCOP(list)}` : "Plan a cotizar"}
            key={`${planCode}-${cycle}`}
          />
          <FormField
            name="maxUsers"
            label="Usuarios incluidos"
            type="number"
            min={1}
            step="1"
            placeholder={plan.maxUsers ? `Plan: ${plan.maxUsers}` : "Sin límite"}
            key={planCode}
          />
          <FormField
            name="trialDays"
            label="Días de prueba sin cobro"
            type="number"
            min={0}
            max={90}
            step="1"
            required
            value={trialDays}
            onChange={(e) => setTrialDays(Number(e.target.value))}
          />
          {trialDays === 0 && (
            <FormField name="paymentReference" label="Referencia del primer pago" required placeholder="Transferencia, consignación…" />
          )}
        </div>
        {plan.code === "INTERNAL" && (
          <p className="text-sm text-muted-foreground">Cuenta interna o de cortesía: sin cobro y sin vencimiento.</p>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="customModules" checked={customize} onChange={(e) => setCustomize(e.target.checked)} className="size-4 accent-[var(--color-primary)]" />
          Personalizar los módulos (por defecto se usan los del plan)
        </label>
        {customize ? (
          <ModulePicker key={planCode} modules={modules} defaultValue={plan.modules} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Incluye: {plan.modules.length ? plan.modules.map((m) => modules.find((x) => x.key === m)?.label ?? m).join(", ") : "solo las funciones básicas"}.
          </p>
        )}
      </section>
    </ActionForm>
  );
}

function Credentials({ created, onAnother }: { created: CreatedClient; onAnother: () => void }) {
  return (
    <div className="grid gap-4">
      <Alert>
        <TriangleAlert />
        <AlertTitle>Cliente creado. Copia la contraseña ahora.</AlertTitle>
        <AlertDescription>
          Esta contraseña temporal <strong>no se vuelve a mostrar</strong> ni queda guardada. Entrégala por un canal seguro (no por correo en texto
          plano si puedes evitarlo). Al ingresar, el administrador deberá elegir una propia.
        </AlertDescription>
      </Alert>
      <dl className="grid gap-3 rounded-xl border p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <dt className="text-muted-foreground">Usuario</dt>
            <dd className="font-medium">{created.adminEmail}</dd>
          </div>
          <CopyButton value={created.adminEmail} label="Copiar usuario" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <dt className="text-muted-foreground">Contraseña temporal</dt>
            <dd className="font-mono text-lg font-semibold tracking-wider">{created.temporaryPassword}</dd>
          </div>
          <CopyButton value={created.temporaryPassword} label="Copiar contraseña" />
        </div>
      </dl>
      <div className="flex flex-wrap gap-3">
        <Link href={`/app/plataforma/clientes/${created.clinicId}`} className={buttonVariants()}>
          Ver el cliente
        </Link>
        <button type="button" className={buttonVariants({ variant: "outline" })} onClick={onAnother}>
          Crear otro
        </button>
      </div>
    </div>
  );
}
