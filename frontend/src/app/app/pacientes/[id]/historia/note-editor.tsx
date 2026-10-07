"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FileSignature, Save, Trash2 } from "lucide-react";
import { FormError } from "@/components/form-error";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DIAGNOSIS_TYPES, type ClinicalNote, type Diagnosis, type DiagnosisType } from "@/lib/types";
import { deleteNote, saveNote, signNote, type NoteInput } from "./actions";
import { DiagnosisPicker } from "./diagnosis-picker";

type TextKey = "reason" | "currentIllness" | "examination" | "procedures" | "plan";

type Props = {
  patientId: string;
  /** Borrador existente; si no, se crea al guardar por primera vez. */
  note?: ClinicalNote;
  appointmentId?: string;
  /** Valores iniciales para una evolución nueva (p. ej. desde una cita). */
  defaults?: { attendedAt: string; reason?: string };
};

/** "2026-10-06T09:30:00-05:00" → "2026-10-06T09:30" (hora de Colombia, para <input type="datetime-local">). */
const toLocalInput = (iso: string) => iso.slice(0, 16);
const fromLocalInput = (value: string) => `${value}:00-05:00`;

export function NoteEditor({ patientId, note, appointmentId, defaults }: Props) {
  const router = useRouter();
  const [id, setId] = useState(note?.id ?? null);
  const [attendedAt, setAttendedAt] = useState(toLocalInput(note?.attendedAt ?? defaults!.attendedAt));
  const [text, setText] = useState<Record<TextKey, string>>({
    reason: note?.reason ?? defaults?.reason ?? "",
    currentIllness: note?.currentIllness ?? "",
    examination: note?.examination ?? "",
    procedures: note?.procedures ?? "",
    plan: note?.plan ?? "",
  });
  const [main, setMain] = useState<Diagnosis | null>(note?.diagnosisMain ?? null);
  const [type, setType] = useState<DiagnosisType | "">(note?.diagnosisType ?? "");
  const [related, setRelated] = useState<(Diagnosis | null)[]>(() => {
    const r: (Diagnosis | null)[] = [...(note?.diagnosisRelated ?? [])];
    while (r.length < 3) r.push(null);
    return r;
  });
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState<string>();
  const [confirming, setConfirming] = useState<"sign" | "delete" | null>(null);
  const [pending, startTransition] = useTransition();
  const historyHref = `/app/pacientes/${patientId}/historia`;

  const input = (): NoteInput => ({
    appointmentId: id ? undefined : appointmentId,
    attendedAt: fromLocalInput(attendedAt),
    ...text,
    diagnosisMain: main?.code,
    diagnosisType: type || undefined,
    diagnosisRelated: related.filter((d): d is Diagnosis => d !== null).map((d) => d.code),
  });

  /** Guarda el borrador; devuelve su id o null si falló. */
  async function save(): Promise<string | null> {
    setError(undefined);
    setSaved(undefined);
    const result = await saveNote(patientId, id, input());
    if (!result.ok) {
      setError(result.error);
      return null;
    }
    if (!id) {
      setId(result.data.id);
      // La URL pasa a ser la del borrador, para poder recargar sin duplicarlo.
      window.history.replaceState(null, "", `${historyHref}/${result.data.id}`);
    }
    return result.data.id;
  }

  function onSave() {
    startTransition(async () => {
      if (await save()) setSaved("Borrador guardado");
    });
  }

  function onSign() {
    startTransition(async () => {
      const savedId = await save();
      if (!savedId) return setConfirming(null);
      const result = await signNote(patientId, savedId);
      if (!result.ok) {
        setError(result.error);
        setConfirming(null);
        return;
      }
      router.push(historyHref);
    });
  }

  function onDelete() {
    if (!id) return router.push(historyHref);
    startTransition(async () => {
      const result = await deleteNote(patientId, id);
      if (!result.ok) {
        setError(result.error);
        setConfirming(null);
        return;
      }
      router.push(historyHref);
    });
  }

  const field = (key: TextKey, label: string, max: number, rows = 3) => (
    <div className="grid gap-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Textarea
        id={key}
        rows={rows}
        maxLength={max}
        value={text[key]}
        onChange={(e) => setText((t) => ({ ...t, [key]: e.target.value }))}
      />
    </div>
  );
  const chosen = [main, ...related].filter((d): d is Diagnosis => d !== null).map((d) => d.code);

  return (
    <div className="grid gap-6">
      <FormError message={error} />

      <Card>
        <CardHeader>
          <CardTitle>Atención</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5 sm:max-w-xs">
            <Label htmlFor="attendedAt">Fecha y hora de atención</Label>
            <Input id="attendedAt" type="datetime-local" required value={attendedAt} onChange={(e) => setAttendedAt(e.target.value)} />
          </div>
          {field("reason", "Motivo de consulta *", 500, 2)}
          {field("currentIllness", "Enfermedad actual", 2000)}
          {field("examination", "Examen estomatológico / hallazgos", 4000, 4)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Diagnóstico (CIE-10)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
            <div className="grid gap-1.5">
              <Label htmlFor="dx-main">Diagnóstico principal *</Label>
              <DiagnosisPicker id="dx-main" value={main} onChange={setMain} exclude={chosen} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="dx-type">Tipo *</Label>
              <select
                id="dx-type"
                value={type}
                onChange={(e) => setType(e.target.value as DiagnosisType | "")}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                <option value="">Selecciona…</option>
                {Object.entries(DIAGNOSIS_TYPES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {main && (
            <div className="grid gap-2">
              <Label>Diagnósticos relacionados (opcional, hasta 3)</Label>
              {related.map((d, i) => (
                <DiagnosisPicker
                  key={i}
                  id={`dx-related-${i}`}
                  value={d}
                  exclude={chosen}
                  onChange={(value) => setRelated((r) => r.map((x, j) => (j === i ? value : x)))}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tratamiento</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {field("procedures", "Procedimientos realizados", 4000, 4)}
          {field("plan", "Plan de tratamiento e indicaciones", 2000)}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={pending} onClick={() => setConfirming("sign")}>
          <FileSignature /> Firmar evolución
        </Button>
        <Button variant="outline" disabled={pending} onClick={onSave}>
          <Save /> {pending && !confirming ? "Guardando…" : "Guardar borrador"}
        </Button>
        <Link href={historyHref} className={buttonVariants({ variant: "ghost" })}>
          Volver
        </Link>
        {id && (
          <Button variant="ghost" className="ml-auto text-destructive" disabled={pending} onClick={() => setConfirming("delete")}>
            <Trash2 /> Eliminar borrador
          </Button>
        )}
        {saved && (
          <p role="status" className="text-sm text-muted-foreground">
            {saved}
          </p>
        )}
      </div>

      {confirming && (
        <Dialog open onOpenChange={(o) => !o && !pending && setConfirming(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{confirming === "sign" ? "¿Firmar la evolución?" : "¿Eliminar el borrador?"}</DialogTitle>
              <DialogDescription>
                {confirming === "sign"
                  ? "Al firmarla queda registrada con tu nombre y no se podrá modificar ni borrar. Para corregirla después tendrás que agregar una nota aclaratoria."
                  : "El borrador se eliminará. Esta acción no se puede deshacer."}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={pending} onClick={() => setConfirming(null)}>
                Cancelar
              </Button>
              {confirming === "sign" ? (
                <Button disabled={pending} onClick={onSign}>
                  {pending ? "Firmando…" : "Firmar"}
                </Button>
              ) : (
                <Button variant="destructive" disabled={pending} onClick={onDelete}>
                  {pending ? "Eliminando…" : "Eliminar"}
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
