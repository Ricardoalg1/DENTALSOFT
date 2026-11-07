"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/form-error";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { whenLabel, type BookingRequest } from "@/lib/booking";
import { PatientPicker, type PickedPatient } from "../patient-picker";
import { confirmRequest, rejectRequest } from "./actions";

export function RequestCard({ request: r }: { request: BookingRequest }) {
  const [patient, setPatient] = useState<PickedPatient | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function act(call: () => ReturnType<typeof confirmRequest>, done: string) {
    setPending(true);
    setError(undefined);
    const result = await call();
    setPending(false);
    if (result.ok) toast.success(done);
    else setError(result.error);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <span className="first-letter:uppercase">{whenLabel(r.startsAt)}</span>
          <Badge variant="outline">{r.visitType}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        <FormError message={error} />
        <dl className="grid gap-1">
          <div><dt className="inline text-muted-foreground">Solicita: </dt><dd className="inline font-medium">{r.fullName}</dd></div>
          <div>
            <dt className="inline text-muted-foreground">Celular: </dt><dd className="inline">{r.phone}{r.verifiedChannel === "WHATSAPP" && " (verificado)"}</dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">Correo: </dt><dd className="inline">{r.email}{r.verifiedChannel === "EMAIL" && " (verificado)"}</dd>
          </div>
          <div><dt className="inline text-muted-foreground">Con: </dt><dd className="inline">{r.dentist.name} · {r.site.name}</dd></div>
        </dl>

        <div className="grid gap-2">
          <p className="font-medium">Paciente</p>
          {!patient && r.matches.length > 0 && (
            <ul className="grid gap-1">
              {r.matches.map((m) => (
                <li key={m.id}>
                  <Button type="button" variant="outline" size="sm" onClick={() => setPatient({ id: m.id, fullName: m.fullName, document: m.document })}>
                    Coincide: {m.fullName} · {m.document}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <PatientPicker value={patient} onChange={setPatient} disabled={pending} />
          {!patient && (
            <Link href={`/app/pacientes/nuevo?solicitud=${r.id}`} className="w-fit font-medium text-primary hover:underline">Es nuevo: crear paciente</Link>
          )}
        </div>

        {rejecting ? (
          <div className="grid gap-2">
            <Input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Motivo para el paciente (opcional)" aria-label="Motivo del rechazo" />
            <div className="flex flex-wrap gap-2">
              <Button variant="destructive" size="sm" disabled={pending} onClick={() => void act(() => rejectRequest(r.id, reason), "Solicitud rechazada")}>Rechazar solicitud</Button>
              <Button variant="outline" size="sm" disabled={pending} onClick={() => setRejecting(false)}>Volver</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending || !patient} onClick={() => patient && void act(() => confirmRequest(r.id, patient.id), "Cita confirmada")}>
              {pending ? "Guardando…" : "Confirmar cita"}
            </Button>
            <Button variant="outline" size="sm" disabled={pending} onClick={() => setRejecting(true)}>Rechazar</Button>
            <a className={buttonVariants({ variant: "ghost", size: "sm" })} href={`tel:${r.phone.replace(/[^\d+]/g, "")}`}>Llamar</a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
