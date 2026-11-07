"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FormError } from "@/components/form-error";
import { SlotPicker } from "@/components/booking/slot-picker";
import { Button } from "@/components/ui/button";
import { whenLabel, type BookingSlot, type ManageView } from "@/lib/booking";
import { cancelBooking, inspectBooking, loadManageSlots, rescheduleBooking } from "../reservar/actions";

type State =
  | { name: "checking" }
  | { name: "invalid" }
  | { name: "view"; token: string; booking: ManageView; mode: "idle" | "confirm-cancel" | "change" }
  | { name: "cancelled" }
  | { name: "changed"; token: string };

export function ManageBooking() {
  const [state, setState] = useState<State>({ name: "checking" });
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const read = useRef(false);

  // El token llega en el fragmento (#t=…), que nunca se envía al servidor. Se borra de la barra de
  // direcciones apenas se lee para que no quede en el historial ni se comparta por error.
  useEffect(() => {
    if (read.current) return;
    read.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get("t");
    window.history.replaceState(null, "", window.location.pathname);
    const check = token ? inspectBooking(token) : Promise.resolve({ ok: false as const, error: "" });
    void check.then((r) => setState(token && r.ok ? { name: "view", token, booking: r.data, mode: "idle" } : { name: "invalid" }));
  }, []);

  const token = state.name === "view" ? state.token : "";
  const load = useCallback((from: string) => loadManageSlots(token, from), [token]);

  if (state.name === "checking") return <p role="status" className="text-sm text-muted-foreground">Revisando el enlace…</p>;
  if (state.name === "invalid") return <p role="alert" className="text-sm">Este enlace no es válido o ya venció. Si necesitas cambiar tu cita, llama a la clínica.</p>;
  if (state.name === "cancelled") return <p role="status" className="text-sm">Listo, tu cita quedó cancelada. La hora quedó libre para otra persona.</p>;
  if (state.name === "changed") return <p role="status" className="text-sm">Recibimos el cambio. La clínica revisará la nueva hora y te avisará.</p>;

  const { booking, mode } = state;
  async function cancel() {
    setPending(true);
    setError(undefined);
    const r = await cancelBooking(token);
    setPending(false);
    if (r.ok) setState({ name: "cancelled" });
    else setError(r.error);
  }
  async function change(slot: BookingSlot) {
    setPending(true);
    setError(undefined);
    const r = await rescheduleBooking(token, slot.siteId, slot.startsAt);
    setPending(false);
    if (r.ok) setState({ name: "changed", token });
    else setError(r.error);
  }
  const setMode = (next: typeof mode) => setState({ ...state, mode: next });

  return (
    <div className="grid gap-4 text-sm">
      <FormError message={error} />
      <dl className="grid gap-1">
        <div><dt className="inline text-muted-foreground">Estado: </dt><dd className="inline font-medium">{booking.status === "CONFIRMED" ? "Confirmada" : "Esperando confirmación de la clínica"}</dd></div>
        <div><dt className="inline text-muted-foreground">Clínica: </dt><dd className="inline">{booking.clinicName}</dd></div>
        <div><dt className="inline text-muted-foreground">Cuándo: </dt><dd className="inline">{whenLabel(booking.startsAt)}</dd></div>
        <div><dt className="inline text-muted-foreground">Dónde: </dt><dd className="inline">{booking.siteName}</dd></div>
        <div><dt className="inline text-muted-foreground">Profesional: </dt><dd className="inline">{booking.dentistName}</dd></div>
        <div><dt className="inline text-muted-foreground">Tipo: </dt><dd className="inline">{booking.visitType}</dd></div>
      </dl>
      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setMode("change")}>Cambiar la hora</Button>
          <Button variant="outline" onClick={() => setMode("confirm-cancel")}>Cancelar la cita</Button>
        </div>
      )}
      {mode === "confirm-cancel" && (
        <div className="grid gap-2">
          <p>¿Seguro que quieres cancelar esta cita?</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="destructive" disabled={pending} onClick={() => void cancel()}>{pending ? "Cancelando…" : "Sí, cancelar"}</Button>
            <Button variant="outline" disabled={pending} onClick={() => setMode("idle")}>No, volver</Button>
          </div>
        </div>
      )}
      {mode === "change" && (
        <div className="grid gap-3">
          <p>Elige la nueva hora. {booking.status === "CONFIRMED" && "Tu cita actual se liberará y la clínica deberá confirmar la nueva."}</p>
          <SlotPicker load={load} onPick={(s) => void change(s)} disabled={pending} />
          <Button variant="outline" className="w-fit" disabled={pending} onClick={() => setMode("idle")}>Volver</Button>
        </div>
      )}
    </div>
  );
}
