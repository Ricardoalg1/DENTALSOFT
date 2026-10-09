"use client";

import { useId, useState } from "react";
import type { ModuleInfo } from "@/lib/platform";
import type { ModuleKey } from "@/lib/types";

type Props = {
  modules: ModuleInfo[];
  defaultValue: ModuleKey[];
  name?: string;
  /** Cambios en la selección (para mostrar el conteo, avisos, etc.). */
  onChange?: (selected: ModuleKey[]) => void;
};

/**
 * Casillas de módulos que respetan sus dependencias: marcar «Facturación» marca también lo que
 * necesita; desmarcar «Tratamientos y caja» desmarca lo que depende de él. El backend vuelve a validarlo.
 */
export function ModulePicker({ modules, defaultValue, name = "modules", onChange }: Props) {
  const uid = useId();
  const [selected, setSelected] = useState<Set<ModuleKey>>(new Set(defaultValue));

  function toggle(key: ModuleKey, on: boolean) {
    const next = new Set(selected);
    if (on) {
      next.add(key);
      modules.find((m) => m.key === key)?.requires.forEach((r) => next.add(r));
    } else {
      next.delete(key);
      let changed = true;
      while (changed) {
        changed = false;
        for (const m of modules) {
          if (next.has(m.key) && m.requires.some((r) => !next.has(r))) {
            next.delete(m.key);
            changed = true;
          }
        }
      }
    }
    setSelected(next);
    onChange?.([...next]);
  }

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">Módulos habilitados</legend>
      <p className="text-xs text-muted-foreground">
        Pacientes, agenda, sedes y equipo siempre están disponibles. Los módulos que quites dejan de funcionar al instante,
        también para quienes ya tienen la sesión abierta.
      </p>
      {modules.map((m) => {
        const id = `${uid}-${m.key}`;
        const needs = m.requires.map((r) => modules.find((x) => x.key === r)?.label ?? r);
        return (
          <label key={m.key} htmlFor={id} className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-sm has-checked:border-primary/50 has-checked:bg-primary/5">
            <input
              id={id}
              type="checkbox"
              name={name}
              value={m.key}
              checked={selected.has(m.key)}
              onChange={(e) => toggle(m.key, e.target.checked)}
              className="mt-0.5 size-4 accent-[var(--color-primary)]"
            />
            <span>
              <span className="font-medium">{m.label}</span>
              <span className="block text-muted-foreground">{m.description}</span>
              {needs.length > 0 && <span className="block text-xs text-muted-foreground">Requiere: {needs.join(", ")}</span>}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
