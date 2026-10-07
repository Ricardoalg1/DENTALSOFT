"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { FileSignature } from "lucide-react";
import { FormError } from "@/components/form-error";
import { NativeSelect } from "@/components/native-select";
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ConsentTemplate, Patient } from "@/lib/types";
import { signConsent } from "./actions";

type Props = {
  patient: Patient;
  templates: ConsentTemplate[];
  professionalName: string;
  clinicName: string;
  today: string;
};

/** Vista previa con los mismos marcadores que reemplaza el backend al firmar. */
function preview(body: string, values: Record<string, string>) {
  return body.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match);
}

export function ConsentForm({ patient, templates, professionalName, clinicName, today }: Props) {
  const minor = patient.age < 18;
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [procedure, setProcedure] = useState("");
  const patientDocument = `${patient.documentType} ${patient.documentNumber}`;
  const signerDefaults = (guardian: boolean) =>
    guardian
      ? { name: patient.guardianName ?? "", document: "", relationship: patient.guardianRelationship ?? "" }
      : { name: patient.fullName, document: patientDocument, relationship: "Paciente" };
  const [byGuardian, setByGuardian] = useState(minor);
  const [signer, setSigner] = useState(() => signerDefaults(minor));
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const signature = useRef<SignaturePadHandle>(null);

  const template = templates.find((t) => t.id === templateId);
  // Misma redacción que arma el backend para {{declarante}}.
  const name = signer.name.trim() || "(nombre de quien firma)";
  const doc = signer.document.trim() || "(documento)";
  const declarant = byGuardian
    ? `Yo, ${name}, identificado(a) con ${doc}, en calidad de ${(signer.relationship.trim() || "acudiente").toLowerCase()} del(de la) paciente ${patient.fullName} (${patientDocument}),`
    : `Yo, ${name}, identificado(a) con ${doc},`;
  const text = useMemo(
    () =>
      template
        ? preview(template.body, {
            declarante: declarant,
            paciente: patient.fullName,
            documento: patientDocument,
            profesional: professionalName,
            clinica: clinicName,
            fecha: today,
            procedimiento: procedure.trim() || "el procedimiento explicado por el profesional",
          })
        : "",
    [template, declarant, patient.fullName, patientDocument, professionalName, clinicName, today, procedure],
  );

  function chooseSigner(guardian: boolean) {
    setByGuardian(guardian);
    setSigner(signerDefaults(guardian));
  }

  function submit() {
    setError(undefined);
    const png = signature.current?.toDataUrl();
    if (!png) {
      setError("Falta la firma");
      return;
    }
    startTransition(async () => {
      const result = await signConsent(patient.id, {
        templateId,
        procedureDetail: procedure.trim() || undefined,
        signerName: signer.name,
        signerDocument: signer.document,
        signerRelationship: byGuardian ? signer.relationship : "Paciente",
        signaturePng: png,
      });
      if (!result.ok) setError(result.error);
    });
  }

  // onSubmit (y no <form action>): React 19 resetea el formulario tras cada acción, incluso si falla,
  // y el usuario perdería lo que escribió.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submit();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Documento</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <NativeSelect
            name="templateId"
            label="Plantilla"
            options={Object.fromEntries(templates.map((t) => [t.id, t.title]))}
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="procedure">Procedimiento específico</Label>
            <Textarea
              id="procedure"
              value={procedure}
              onChange={(e) => setProcedure(e.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="Ej.: exodoncia del diente 85"
            />
          </div>
          <div className="grid gap-1.5">
            <p className="text-sm font-medium">Texto que se firmará</p>
            <div className="max-h-80 overflow-y-auto rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed whitespace-pre-line">
              {text}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quién firma</CardTitle>
          {minor && <CardDescription>El paciente es menor de edad: firma su acudiente o representante legal.</CardDescription>}
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-4 text-sm" role="radiogroup" aria-label="Quién firma">
            <label className="flex items-center gap-2">
              <input type="radio" name="who" checked={!byGuardian} disabled={minor} onChange={() => chooseSigner(false)} className="accent-primary" />
              El paciente
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="who" checked={byGuardian} onChange={() => chooseSigner(true)} className="accent-primary" />
              Acudiente o representante
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="signerName">Nombre completo</Label>
              <Input
                id="signerName"
                name="signerName"
                required
                maxLength={150}
                value={signer.name}
                onChange={(e) => setSigner({ ...signer, name: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="signerDocument">Documento</Label>
              <Input
                id="signerDocument"
                name="signerDocument"
                required
                maxLength={30}
                value={signer.document}
                onChange={(e) => setSigner({ ...signer, document: e.target.value })}
              />
            </div>
            {byGuardian && (
              <div className="grid gap-1.5">
                <Label htmlFor="signerRelationship">Parentesco</Label>
                <Input
                  id="signerRelationship"
                  name="signerRelationship"
                  required
                  maxLength={40}
                  placeholder="Madre, padre, tutor…"
                  value={signer.relationship}
                  onChange={(e) => setSigner({ ...signer, relationship: e.target.value })}
                />
              </div>
            )}
          </div>
          <SignaturePad ref={signature} label="Firma de quien da el consentimiento" />
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              required
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 size-4 accent-primary"
            />
            Quien firma leyó el documento, recibió las explicaciones del profesional y pudo hacer preguntas.
          </label>
        </CardContent>
      </Card>

      <FormError message={error} />
      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={pending || !accepted || !template}>
          <FileSignature /> {pending ? "Firmando…" : "Firmar consentimiento"}
        </Button>
        <Link href={`/app/pacientes/${patient.id}/consentimientos`} className={buttonVariants({ variant: "outline", size: "lg" })}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
