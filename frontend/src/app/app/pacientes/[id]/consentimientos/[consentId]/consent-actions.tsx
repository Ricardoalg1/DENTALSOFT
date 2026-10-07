"use client";

import { useState, useTransition } from "react";
import { Ban, Printer } from "lucide-react";
import { FormError } from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { revokeConsent } from "../actions";

type Props = { patientId: string; consentId: string; canRevoke: boolean };

export function ConsentActions({ patientId, consentId, canRevoke }: Props) {
  const [revoking, setRevoking] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <div className="no-print grid gap-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => window.print()}>
          <Printer /> Imprimir o guardar PDF
        </Button>
        {canRevoke && !revoking && (
          <Button variant="destructive" onClick={() => setRevoking(true)}>
            <Ban /> Registrar revocación
          </Button>
        )}
      </div>
      {revoking && (
        <div className="grid max-w-xl gap-2">
          <Label htmlFor="revoke-reason">Motivo por el que el paciente retira su consentimiento</Label>
          <Textarea id="revoke-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} />
          <FormError message={error} />
          <div className="flex gap-2">
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await revokeConsent(patientId, consentId, reason);
                  if (result.ok) setRevoking(false);
                  else setError(result.error);
                })
              }
            >
              {pending ? "Guardando…" : "Confirmar revocación"}
            </Button>
            <Button variant="outline" onClick={() => setRevoking(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
