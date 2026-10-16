"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { PatientPicker, type PickedPatient } from "@/app/app/agenda/patient-picker";
import { FormError } from "@/components/form-error";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCOP, formatDate } from "@/lib/format";
import { FINANCING_FREQUENCIES, type FinancingFrequency } from "@/lib/types";
import { createFinancing } from "../actions";

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** Vencimiento de la cuota i (misma regla que el backend). */
function due(first: string, frequency: FinancingFrequency, i: number) {
  const d = new Date(`${first}T00:00:00Z`);
  if (frequency === "MONTHLY") {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + i);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
  } else d.setUTCDate(d.getUTCDate() + i * (frequency === "WEEKLY" ? 7 : 14));
  return d.toISOString().slice(0, 10);
}

export function FinancingForm({ today }: { today: string }) {
  const router = useRouter();
  const [patient, setPatient] = useState<PickedPatient | null>(null);
  const [concept, setConcept] = useState("");
  const [total, setTotal] = useState("");
  const [down, setDown] = useState("0");
  const [count, setCount] = useState("6");
  const [frequency, setFrequency] = useState<FinancingFrequency>("MONTHLY");
  const [firstDue, setFirstDue] = useState(today);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const totalN = Number(total) || 0;
  const downN = Number(down) || 0;
  const n = Math.max(1, Math.min(60, Math.trunc(Number(count) || 1)));
  const financed = Math.max(0, totalN - downN);
  const each = Math.floor((financed / n) * 100) / 100;
  const schedule = totalN > 0 && financed > 0
    ? Array.from({ length: n }, (_, i) => ({
        number: i + 1,
        date: due(firstDue, frequency, i),
        amount: i === n - 1 ? Math.round((financed - each * (n - 1)) * 100) / 100 : each,
      }))
    : [];

  function submit() {
    setError(undefined);
    if (!patient) return setError("Elige el paciente");
    startTransition(async () => {
      const r = await createFinancing(patient.id, {
        concept,
        totalAmount: totalN,
        downPayment: downN,
        installments: n,
        frequency,
        firstDue,
        notes,
      });
      if (!r.ok) return setError(r.error);
      router.push(`/app/financiamiento/${r.data.id}`);
    });
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Acuerdo</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>Paciente *</Label>
            <PatientPicker value={patient} onChange={setPatient} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="concept">Concepto *</Label>
            <Input id="concept" maxLength={200} value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Ej. Tratamiento de ortodoncia" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="total">Valor total ($) *</Label>
            <Input id="total" type="number" min="0.01" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="down">Cuota inicial ($)</Label>
            <Input id="down" type="number" min="0" step="0.01" value={down} onChange={(e) => setDown(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="count">Número de cuotas *</Label>
            <Input id="count" type="number" min={1} max={60} value={count} onChange={(e) => setCount(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="frequency">Periodicidad *</Label>
            <select id="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as FinancingFrequency)} className={selectClass}>
              {Object.entries(FINANCING_FREQUENCIES).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="firstDue">Vence la primera cuota *</Label>
            <Input id="firstDue" type="date" min={today} value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {schedule.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cuotas</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {downN > 0 && (
                <li className="flex justify-between rounded-md bg-muted/50 px-3 py-1.5">
                  <span>Cuota inicial · hoy</span>
                  <span className="tabular-nums">{formatCOP(downN)}</span>
                </li>
              )}
              {schedule.map((s) => (
                <li key={s.number} className="flex justify-between rounded-md bg-muted/50 px-3 py-1.5">
                  <span>
                    Cuota {s.number} · {formatDate(s.date)}
                  </span>
                  <span className="tabular-nums">{formatCOP(s.amount)}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <FormError message={error} />
      <div className="flex justify-end gap-2">
        <Link href="/app/financiamiento" className={buttonVariants({ variant: "outline" })}>
          Cancelar
        </Link>
        <Button disabled={pending || schedule.length === 0} onClick={submit}>
          <Save /> {pending ? "Guardando…" : "Crear financiamiento"}
        </Button>
      </div>
    </div>
  );
}
