"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FileSignature, Save, Trash2 } from "lucide-react";
import { FormError } from "@/components/form-error";
import { Periodontogram } from "@/components/periodontogram";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PerioExam, PerioTooth } from "@/lib/types";
import { deleteExam, saveExam, signExam } from "./actions";

type Props = {
  patientId: string;
  /** Borrador existente; si no, se crea al guardar por primera vez. */
  exam?: PerioExam;
  /** Fecha inicial de un periodontograma nuevo (hora de Colombia con offset). */
  defaultExaminedAt: string;
};

/** "2026-10-06T09:30:00-05:00" → "2026-10-06T09:30" (hora de Colombia, para <input type="datetime-local">). */
const toLocalInput = (iso: string) => iso.slice(0, 16);
const fromLocalInput = (value: string) => `${value}:00-05:00`;

export function ExamEditor({ patientId, exam, defaultExaminedAt }: Props) {
  const router = useRouter();
  const [id, setId] = useState(exam?.id ?? null);
  const [examinedAt, setExaminedAt] = useState(toLocalInput(exam?.examinedAt ?? defaultExaminedAt));
  const [observations, setObservations] = useState(exam?.observations ?? "");
  const [teeth, setTeeth] = useState<PerioTooth[]>(exam?.chart.teeth ?? []);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState<string>();
  const [confirming, setConfirming] = useState<"sign" | "delete" | "clear" | null>(null);
  const [pending, startTransition] = useTransition();
  const listHref = `/app/pacientes/${patientId}/periodontograma`;

  /** Guarda el borrador; devuelve su id o null si falló. */
  async function save(): Promise<string | null> {
    setError(undefined);
    setSaved(undefined);
    const result = await saveExam(patientId, id, {
      examinedAt: fromLocalInput(examinedAt),
      observations,
      chart: { teeth },
    });
    if (!result.ok) {
      setError(result.error);
      return null;
    }
    if (!id) {
      setId(result.data.id);
      // La URL pasa a ser la del borrador, para poder recargar sin duplicarlo.
      window.history.replaceState(null, "", `${listHref}/${result.data.id}`);
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
      const result = await signExam(patientId, savedId);
      if (!result.ok) {
        setError(result.error);
        setConfirming(null);
        return;
      }
      router.push(`${listHref}?examen=${savedId}`);
    });
  }

  function onDelete() {
    if (!id) return router.push(listHref);
    startTransition(async () => {
      const result = await deleteExam(patientId, id);
      if (!result.ok) {
        setError(result.error);
        setConfirming(null);
        return;
      }
      router.push(listHref);
    });
  }

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <Button disabled={pending} onClick={() => setConfirming("sign")}>
        <FileSignature /> Firmar periodontograma
      </Button>
      <Button variant="outline" disabled={pending} onClick={onSave}>
        <Save /> {pending && !confirming ? "Guardando…" : "Guardar borrador"}
      </Button>
      <Button variant="ghost" disabled={pending || teeth.length === 0} onClick={() => setConfirming("clear")}>
        Limpiar datos
      </Button>
      <Link href={listHref} className={buttonVariants({ variant: "ghost" })}>
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
  );

  const dialog = {
    sign: {
      title: "¿Firmar el periodontograma?",
      body: "Al firmarlo queda registrado con tu nombre y no se podrá modificar ni borrar. Para un nuevo control registra otro periodontograma.",
      confirm: pending ? "Firmando…" : "Firmar",
      run: onSign,
      destructive: false,
    },
    delete: {
      title: "¿Eliminar el borrador?",
      body: "El borrador se eliminará. Esta acción no se puede deshacer.",
      confirm: pending ? "Eliminando…" : "Eliminar",
      run: onDelete,
      destructive: true,
    },
    clear: {
      title: "¿Limpiar todos los datos?",
      body: "Se borran todas las mediciones del periodontograma. El cambio se guarda cuando guardes el borrador.",
      confirm: "Limpiar",
      run: () => {
        setTeeth([]);
        setConfirming(null);
      },
      destructive: true,
    },
  } as const;

  return (
    <div className="grid gap-4">
      <FormError message={error} />
      <div className="grid gap-4 sm:grid-cols-[16rem_1fr]">
        <div className="grid content-start gap-1.5">
          <Label htmlFor="examinedAt">Fecha y hora del examen</Label>
          <Input id="examinedAt" type="datetime-local" required value={examinedAt} onChange={(e) => setExaminedAt(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="observations">Observaciones / comentarios</Label>
          <Textarea id="observations" rows={2} maxLength={1000} value={observations} onChange={(e) => setObservations(e.target.value)} />
        </div>
      </div>
      {actions}
      <Periodontogram teeth={teeth} onChange={setTeeth} />
      {actions}

      {confirming && (
        <Dialog open onOpenChange={(o) => !o && !pending && setConfirming(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{dialog[confirming].title}</DialogTitle>
              <DialogDescription>{dialog[confirming].body}</DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={pending} onClick={() => setConfirming(null)}>
                Cancelar
              </Button>
              <Button
                variant={dialog[confirming].destructive ? "destructive" : "default"}
                disabled={pending}
                onClick={dialog[confirming].run}
              >
                {dialog[confirming].confirm}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
