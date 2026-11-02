"use client";

import { Pencil } from "lucide-react";
import { useActionState, useState } from "react";
import { FormError } from "@/components/form-error";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { FormState } from "@/lib/forms";
import type { Site } from "@/lib/types";
import { updateSite } from "./actions";

/** La dirección y el teléfono de la sede salen en las invitaciones a citas por WhatsApp. */
export function EditSiteDialog({ site }: { site: Site }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await updateSite(site.id, prev, formData);
    if (result?.ok) setOpen(false);
    return result;
  }, undefined);
  const v = state?.values;
  const e = state?.fieldErrors;

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Editar ${site.name}`}>
        <Pencil /> Editar
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar sede</DialogTitle>
          </DialogHeader>
          <form action={action} className="grid gap-4">
            <FormError message={state?.error} />
            <FormField name="name" label="Nombre" required defaultValue={v?.name ?? site.name} errors={e?.name} />
            <FormField name="address" label="Dirección" defaultValue={v?.address ?? site.address ?? ""} errors={e?.address} />
            <FormField name="city" label="Ciudad" defaultValue={v?.city ?? site.city ?? ""} errors={e?.city} />
            <FormField name="phone" label="Teléfono" type="tel" defaultValue={v?.phone ?? site.phone ?? ""} errors={e?.phone} />
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar cambios"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
