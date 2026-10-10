"use client";
import { Plus } from "lucide-react";

import { useActionState } from "react";
import { FormError } from "@/components/form-error";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { createSite } from "./actions";

export function CreateSiteForm() {
  const [state, action, pending] = useActionState(createSite, undefined);
  const v = state?.values;
  const e = state?.fieldErrors;
  return (
    <form action={action} className="grid gap-4">
      <FormError message={state?.error} />
      {state?.ok && <p className="text-sm text-primary">Sede creada.</p>}
      <FormField name="name" placeholder="Ej. Clínica Occlus Centro" label="Nombre" required defaultValue={v?.name} errors={e?.name} />
      <FormField name="address" placeholder="Ej. Calle 123 # 45–67" label="Dirección" defaultValue={v?.address} errors={e?.address} />
      <FormField name="city" placeholder="Ej. Bogotá" label="Ciudad" defaultValue={v?.city} errors={e?.city} />
      <FormField name="phone" placeholder="Ej. 300 123 4567" label="Teléfono" type="tel" defaultValue={v?.phone} errors={e?.phone} />
      <Button type="submit" disabled={pending}>
        <Plus aria-hidden="true" />{pending ? "Guardando…" : "Agregar sede"}
      </Button>
    </form>
  );
}
