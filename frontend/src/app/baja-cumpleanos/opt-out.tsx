"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { optOutBirthdayEmails } from "./actions";

type State =
  | { name: "ready"; token: string }
  | { name: "invalid" }
  | { name: "done"; clinicName: string }
  | { name: "error"; token: string };

/**
 * La baja exige un clic: así un programa que abre los enlaces de los correos por seguridad no la hace
 * por su cuenta. El token llega en el fragmento (#t=…), que no se envía al servidor, y se borra de la barra.
 */
export function OptOut() {
  const [state, setState] = useState<State>();
  const [pending, setPending] = useState(false);
  const read = useRef(false);

  useEffect(() => {
    if (read.current) return;
    read.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get("t");
    window.history.replaceState(null, "", window.location.pathname);
    setState(token ? { name: "ready", token } : { name: "invalid" });
  }, []);

  if (!state) return <p role="status" className="text-sm text-muted-foreground">Revisando el enlace…</p>;
  if (state.name === "invalid") {
    return <p role="alert" className="text-sm">Este enlace no es válido o ya se usó. Si quieres dejar de recibir los saludos, avísale a tu clínica.</p>;
  }
  if (state.name === "done") {
    return <p role="status" className="text-sm">Listo. {state.clinicName} ya no te enviará saludos de cumpleaños por correo.</p>;
  }

  const token = state.token;
  async function confirm() {
    setPending(true);
    const r = await optOutBirthdayEmails(token);
    setPending(false);
    if (!r.ok) setState({ name: "error", token });
    else if (r.clinicName) setState({ name: "done", clinicName: r.clinicName });
    else setState({ name: "invalid" });
  }

  return (
    <div className="grid gap-4 text-sm">
      {state.name === "error" && <p role="alert" className="text-destructive">No pudimos procesar la solicitud. Inténtalo de nuevo en unos minutos.</p>}
      <p>¿Quieres dejar de recibir el saludo de cumpleaños por correo? Seguirás recibiendo los mensajes sobre tus citas.</p>
      <Button type="button" onClick={confirm} disabled={pending} className="justify-self-start">
        {pending ? "Procesando…" : "Sí, no quiero recibir más saludos"}
      </Button>
    </div>
  );
}
