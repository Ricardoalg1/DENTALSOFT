"use client";
import { useActionState } from "react";
import { updateLead } from "@/app/app/comercial/actions";
const labels = {
  NEW: "Nueva",
  CONTACTED: "Contactada",
  DEMO_SCHEDULED: "Demo agendada",
  WON: "Ganada",
  LOST: "Cerrada sin venta",
};
export function LeadForm({
  id,
  status,
  followUpOn,
}: {
  id: string;
  status: keyof typeof labels;
  followUpOn: string | null;
}) {
  const [state, action, pending] = useActionState(updateLead, {});
  return (
    <form action={action} className="mt-5 grid gap-3">
      <input type="hidden" name="id" value={id} />
      <label className="text-sm">
        Estado
        <select
          name="status"
          defaultValue={status}
          className="mt-1 block w-full rounded border p-2"
        >
          {Object.entries(labels).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Próximo seguimiento (opcional)
        <input
          type="date"
          name="followUpOn"
          defaultValue={followUpOn ?? ""}
          className="mt-1 block w-full rounded border p-2"
        />
      </label>
      <label className="text-sm">
        Nota de seguimiento
        <textarea
          name="note"
          required
          minLength={3}
          maxLength={1000}
          rows={3}
          className="mt-1 block w-full rounded border p-2"
        />
      </label>
      <button
        disabled={pending}
        className="w-fit rounded bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Guardando…" : "Guardar gestión"}
      </button>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="text-sm text-teal-800">
          Gestión registrada.
        </p>
      )}
    </form>
  );
}
