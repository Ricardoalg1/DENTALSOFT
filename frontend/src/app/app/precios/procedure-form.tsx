"use client";

import { useState, useTransition } from "react";
import { FormError } from "@/components/form-error";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ODONTOGRAM_CONDITIONS,
  PROCEDURE_CATEGORIES,
  type OdontogramCondition,
  type Procedure,
  type ProcedureCategory,
} from "@/lib/types";
import { saveProcedure } from "./actions";

/** Hallazgos del odontograma que un procedimiento puede resolver (para sugerir planes). */
const FINDINGS = Object.fromEntries(
  Object.entries(ODONTOGRAM_CONDITIONS)
    .filter(([, info]) => info.kind === "finding")
    .map(([key, info]) => [key, info.label]),
);

/** Crear (procedure = undefined) o editar un procedimiento de la lista de precios. */
export function ProcedureForm({ procedure }: { procedure?: Procedure }) {
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const p = procedure?.id ?? "new";

  // onSubmit (no <form action>) para que un error no borre lo escrito.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    setError(undefined);
    setSaved(false);
    startTransition(async () => {
      const result = await saveProcedure(procedure?.id ?? null, {
        name: String(form.get("name")),
        code: String(form.get("code") ?? "") || undefined,
        category: String(form.get("category")) as ProcedureCategory,
        cupsCode: String(form.get("cupsCode") ?? "") || undefined,
        price: Number(String(form.get("price")).replace(/\D/g, "")),
        perTooth: form.get("perTooth") === "on",
        treatsCondition: (String(form.get("treatsCondition") ?? "") || null) as OdontogramCondition | null,
        active: form.get("active") === "on",
      });
      if (result.ok) {
        setSaved(true);
        if (!procedure) formEl.reset();
      } else setError(result.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <div className="grid gap-1.5">
          <Label htmlFor={`${p}-name`}>Nombre</Label>
          <Input id={`${p}-name`} name="name" required maxLength={150} defaultValue={procedure?.name} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${p}-price`}>Precio (COP)</Label>
          <Input
            id={`${p}-price`}
            name="price"
            required
            inputMode="numeric"
            pattern="[0-9.]*"
            defaultValue={procedure ? String(procedure.price) : ""}
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <NativeSelect
          name="category"
          id={`${p}-category`}
          label="Categoría"
          options={PROCEDURE_CATEGORIES}
          defaultValue={procedure?.category ?? "RESTORATIVE"}
        />
        <div className="grid gap-1.5">
          <Label htmlFor={`${p}-cups`}>Código CUPS</Label>
          <Input id={`${p}-cups`} name="cupsCode" maxLength={10} defaultValue={procedure?.cupsCode ?? ""} placeholder="Para RIPS" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${p}-code`}>Código interno</Label>
          <Input id={`${p}-code`} name="code" maxLength={20} defaultValue={procedure?.code ?? ""} />
        </div>
      </div>
      <NativeSelect
        name="treatsCondition"
        id={`${p}-treats`}
        label="Resuelve este hallazgo del odontograma (para sugerir planes)"
        options={FINDINGS}
        placeholder="Ninguno"
        defaultValue={procedure?.treatsCondition ?? ""}
      />
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="perTooth" defaultChecked={procedure?.perTooth ?? true} className="size-4 accent-primary" />
          Se cobra por diente
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="active" defaultChecked={procedure?.active ?? true} className="size-4 accent-primary" />
          Activo
        </label>
      </div>
      <FormError message={error} />
      {saved && <p className="text-sm text-primary">Guardado.</p>}
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Guardando…" : procedure ? "Guardar cambios" : "Agregar procedimiento"}
      </Button>
    </form>
  );
}
