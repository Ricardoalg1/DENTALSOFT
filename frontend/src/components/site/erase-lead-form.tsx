"use client";
import { useActionState } from "react";
import { eraseLead } from "@/app/app/comercial/actions";
export function EraseLeadForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(eraseLead, {});
  return (
    <details className="rounded-xl border border-red-200 p-5">
      <summary className="cursor-pointer font-medium text-red-800">
        Eliminar solicitud por privacidad
      </summary>
      <p className="mt-4 text-sm">
        La eliminación es permanente e incluye datos de contacto, mensaje y
        todas las notas. Se conserva únicamente un registro del identificador,
        operador, motivo y fecha de eliminación.
      </p>
      <form action={action} className="mt-4 grid gap-4">
        <input type="hidden" name="id" value={id} />
        <label className="flex gap-2 text-sm">
          <input type="checkbox" name="verified" required />
          Verifiqué la identidad y la petición de eliminación del solicitante.
        </label>
        <label className="text-sm">
          Escribe ELIMINAR para confirmar
          <input
            name="confirmation"
            required
            pattern="ELIMINAR"
            autoComplete="off"
            className="mt-1 block w-full rounded border p-2"
          />
        </label>
        <button
          disabled={pending}
          className="w-fit rounded bg-red-700 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {pending ? "Eliminando…" : "Eliminar definitivamente"}
        </button>
        {state.error && (
          <p role="alert" className="text-sm text-red-800">
            {state.error}
          </p>
        )}
      </form>
    </details>
  );
}
